/**
 * Renders a word into a black-and-white mask texture, for confining a
 * reaction-diffusion field to its letterforms.
 *
 * White (1) where the reaction may grow, black (0) where it may not. Drawn from
 * the page's own computed font, so the mask always matches the type the layout
 * is actually setting — no exported asset to keep in sync, and it re-renders
 * for free when the webfont swaps in.
 */

import * as THREE from 'three';

export interface LogotypeMask {
  texture: THREE.Texture;
  /** Redraw at a new size — after a resize, or once the real webfont lands. */
  update(width: number, height: number, font: string): void;
  destroy(): void;
}

export function makeLogotypeMask(text: string): LogotypeMask {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext('2d');

  const texture = new THREE.CanvasTexture(canvas);
  // The mask is sampled as raw coverage, not as colour — decoding it as sRGB
  // would bend the values and soften the boundary.
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;

  return {
    texture,
    update(width: number, height: number, font: string): void {
      if (!ctx || width < 1 || height < 1) return;
      canvas.width = Math.round(width);
      canvas.height = Math.round(height);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.font = font;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      ctx.fillStyle = '#fff';
      // NO manual flip. THREE.CanvasTexture already uploads with flipY = true,
      // so flipping here as well renders the word upside down — which is
      // exactly what it did the first time.
      ctx.fillText(text, 0, canvas.height / 2);

      texture.needsUpdate = true;
    },
    destroy(): void {
      texture.dispose();
    },
  };
}
