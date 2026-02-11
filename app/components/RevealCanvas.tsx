"use client";

import { useEffect, useRef } from "react";

const VERT = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() {
  v_uv = a_position * 0.5 + 0.5;
  v_uv.y = 1.0 - v_uv.y;
  gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const FRAG = `
precision mediump float;
varying vec2 v_uv;
uniform sampler2D u_image;
uniform sampler2D u_mask;
uniform vec2 u_resolution;
uniform vec2 u_imageSize;

void main() {
  float cAspect = u_resolution.x / u_resolution.y;
  float iAspect = u_imageSize.x / u_imageSize.y;
  vec2 s = vec2(1.0);
  if (cAspect > iAspect) {
    s.y = iAspect / cAspect;
  } else {
    s.x = cAspect / iAspect;
  }
  vec2 uv = v_uv * s + (1.0 - s) * 0.5;

  vec4 color = texture2D(u_image, uv);
  float reveal = texture2D(u_mask, v_uv).r;
  float luma = dot(color.rgb, vec3(0.299, 0.587, 0.114));

  // Boost saturation on reveal so color pops against the B&W
  float boost = 1.05;
  vec3 saturated = mix(vec3(luma), color.rgb, boost);
  gl_FragColor = vec4(mix(vec3(luma), saturated, reveal), 1.0);
}`;

export default function RevealCanvas({ src, mobileSrc }: { src: string; mobileSrc?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl");
    if (!gl) return;

    // Compile shaders
    function compile(type: number, source: string) {
      const s = gl!.createShader(type)!;
      gl!.shaderSource(s, source);
      gl!.compileShader(s);
      return s;
    }

    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);

    // Fullscreen quad
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW
    );

    const aPos = gl.getAttribLocation(prog, "a_position");
    const uImage = gl.getUniformLocation(prog, "u_image");
    const uMask = gl.getUniformLocation(prog, "u_mask");
    const uRes = gl.getUniformLocation(prog, "u_resolution");
    const uImgSize = gl.getUniformLocation(prog, "u_imageSize");

    // Textures
    const imgTex = gl.createTexture()!;
    const maskTex = gl.createTexture()!;

    for (const tex of [imgTex, maskTex]) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    }

    // Offscreen mask canvas (2D) for cursor trail
    const mask = document.createElement("canvas");
    const mctx = mask.getContext("2d")!;

    let imgW = 1;
    let imgH = 1;
    let loaded = false;
    let mx = -9999;
    let my = -9999;
    let active = false;
    let px = mx;
    let py = my;

    const RADIUS = 180;
    const FADE = 0.02;

    function resize() {
      const dpr = devicePixelRatio || 1;
      const w = innerWidth;
      const h = innerHeight;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      canvas!.style.width = w + "px";
      canvas!.style.height = h + "px";
      mask.width = w * dpr;
      mask.height = h * dpr;
      mctx.clearRect(0, 0, mask.width, mask.height);
      gl!.viewport(0, 0, canvas!.width, canvas!.height);
    }

    resize();
    addEventListener("resize", resize);

    function setPos(cx: number, cy: number) {
      const dpr = devicePixelRatio || 1;
      mx = cx * dpr;
      my = cy * dpr;
      if (!active) {
        px = mx;
        py = my;
      }
      active = true;
    }

    const onMouse = (e: MouseEvent) => setPos(e.clientX, e.clientY);
    const onLeave = () => {
      active = false;
    };
    const onTouch = (e: TouchEvent) => {
      e.preventDefault();
      if (e.touches.length > 0) {
        setPos(e.touches[0].clientX, e.touches[0].clientY);
      }
    };
    const onTouchEnd = () => {
      active = false;
    };

    canvas.addEventListener("mousemove", onMouse);
    canvas.addEventListener("mouseleave", onLeave);
    canvas.addEventListener("touchstart", onTouch, { passive: false });
    canvas.addEventListener("touchmove", onTouch, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd);

    // Load background image (swap source at mobile breakpoint)
    const MOBILE_BREAKPOINT = 768;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgW = img.naturalWidth;
      imgH = img.naturalHeight;
      gl!.bindTexture(gl!.TEXTURE_2D, imgTex);
      gl!.texImage2D(
        gl!.TEXTURE_2D,
        0,
        gl!.RGBA,
        gl!.RGBA,
        gl!.UNSIGNED_BYTE,
        img
      );
      loaded = true;
    };

    function pickSrc() {
      return mobileSrc && window.innerWidth < MOBILE_BREAKPOINT ? mobileSrc : src;
    }

    let currentSrc = pickSrc();
    img.src = currentSrc;

    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onBreakpoint = () => {
      const next = pickSrc();
      if (next !== currentSrc) {
        currentSrc = next;
        loaded = false;
        img.src = currentSrc;
      }
    };
    mql.addEventListener("change", onBreakpoint);

    // Animation loop
    let raf: number;

    function frame() {
      raf = requestAnimationFrame(frame);
      if (!loaded) return;

      const dpr = devicePixelRatio || 1;
      const r = RADIUS * dpr;
      const w = mask.width;
      const h = mask.height;

      // Fade existing trail toward black
      mctx.fillStyle = `rgba(0,0,0,${FADE})`;
      mctx.fillRect(0, 0, w, h);

      // Paint deforming blob along cursor path
      if (active) {
        const dx = mx - px;
        const dy = my - py;
        const speed = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);
        const dist = speed;
        const steps = Math.max(1, Math.ceil(dist / (r * 0.25)));
        const time = performance.now() * 0.003;

        // Stretch along movement direction based on speed
        const stretch = 1 + Math.min(speed / (r * 0.3), 2.5);
        const squash = 1 / Math.sqrt(stretch);

        // Draw multiple offset lobes to break up the circular shape
        const lobes = [
          { ox: 0, oy: 0, s: 1.0, a: 0.7 },
          { ox: 0.3, oy: 0.15, s: 0.7, a: 0.5 },
          { ox: -0.2, oy: -0.25, s: 0.65, a: 0.45 },
          { ox: 0.1, oy: -0.3, s: 0.55, a: 0.4 },
        ];

        for (let i = 0; i <= steps; i++) {
          const t = i / steps;
          const x = px + dx * t;
          const y = py + dy * t;

          for (let l = 0; l < lobes.length; l++) {
            const lobe = lobes[l];
            // Each lobe wobbles independently
            const wobblePhase = time * (1.2 + l * 0.5) + l * 2.0;
            const lx = x + (lobe.ox * r + Math.sin(wobblePhase) * r * 0.2);
            const ly = y + (lobe.oy * r + Math.cos(wobblePhase * 0.8) * r * 0.2);
            const lr = r * lobe.s;

            mctx.save();
            mctx.translate(lx, ly);
            mctx.rotate(angle + l * 0.3);
            mctx.scale(l === 0 ? stretch : 1 + (stretch - 1) * 0.4, l === 0 ? squash : 1);

            const g = mctx.createRadialGradient(0, 0, 0, 0, 0, lr);
            g.addColorStop(0, `rgba(255,255,255,${lobe.a})`);
            g.addColorStop(0.5, `rgba(255,255,255,${lobe.a * 0.4})`);
            g.addColorStop(1, "rgba(255,255,255,0)");
            mctx.fillStyle = g;
            mctx.fillRect(-lr, -lr, lr * 2, lr * 2);
            mctx.restore();
          }
        }

        // Satellite blobs orbiting the cursor
        const satellites = 6;
        for (let s = 0; s < satellites; s++) {
          const sAngle = time * (0.5 + s * 0.2) + s * ((Math.PI * 2) / satellites);
          const sDist = r * (0.55 + 0.3 * Math.sin(time * 1.1 + s * 1.8));
          const sx = mx + Math.cos(sAngle) * sDist;
          const sy = my + Math.sin(sAngle) * sDist;
          const sr = r * (0.45 + 0.15 * Math.sin(time * 1.7 + s));

          const sg = mctx.createRadialGradient(sx, sy, 0, sx, sy, sr);
          sg.addColorStop(0, "rgba(255,255,255,0.4)");
          sg.addColorStop(1, "rgba(255,255,255,0)");
          mctx.fillStyle = sg;
          mctx.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
        }

        px = mx;
        py = my;
      }

      // Upload mask as texture
      gl!.activeTexture(gl!.TEXTURE1);
      gl!.bindTexture(gl!.TEXTURE_2D, maskTex);
      gl!.texImage2D(
        gl!.TEXTURE_2D,
        0,
        gl!.RGBA,
        gl!.RGBA,
        gl!.UNSIGNED_BYTE,
        mask
      );

      // Render fullscreen quad
      gl!.useProgram(prog);
      gl!.bindBuffer(gl!.ARRAY_BUFFER, buf);
      gl!.enableVertexAttribArray(aPos);
      gl!.vertexAttribPointer(aPos, 2, gl!.FLOAT, false, 0, 0);

      gl!.activeTexture(gl!.TEXTURE0);
      gl!.bindTexture(gl!.TEXTURE_2D, imgTex);
      gl!.uniform1i(uImage, 0);
      gl!.uniform1i(uMask, 1);
      gl!.uniform2f(uRes, canvas!.width, canvas!.height);
      gl!.uniform2f(uImgSize, imgW, imgH);

      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
    }

    frame();

    return () => {
      cancelAnimationFrame(raf);
      removeEventListener("resize", resize);
      canvas.removeEventListener("mousemove", onMouse);
      canvas.removeEventListener("mouseleave", onLeave);
      canvas.removeEventListener("touchstart", onTouch);
      canvas.removeEventListener("touchmove", onTouch);
      canvas.removeEventListener("touchend", onTouchEnd);
      mql.removeEventListener("change", onBreakpoint);
    };
  }, [src, mobileSrc]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0"
      style={{ touchAction: "none" }}
    />
  );
}
