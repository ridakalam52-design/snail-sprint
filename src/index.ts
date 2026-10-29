/**
 * Snail Sprint — a seated, hands-first mixed-reality tabletop race.
 * Built with Meta's Immersive Web SDK (IWSDK).
 */
import { VisibilityState, World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { GameSystem } from './game.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(GameSystem);

  const overlay = document.getElementById('overlay');
  const enter = document.getElementById('enter-xr') as HTMLButtonElement | null;
  if (enter) {
    if (!world.xrEnabled) enter.style.display = 'none';
    enter.addEventListener('click', () => world.launchXR());
    navigator.xr
      ?.isSessionSupported('immersive-ar')
      .then((ok) => {
        if (!ok) {
          enter.disabled = true;
          enter.textContent = 'Open on Meta Quest to play in MR';
        }
      })
      .catch(() => undefined);
  }
  world.visibilityState.subscribe((vs) => {
    if (overlay) overlay.style.display = vs === VisibilityState.NonImmersive ? 'block' : 'none';
  });

  // Exposed for the automated demo recorder (scripts/record-demo.py).
  (window as unknown as { __snail: unknown }).__snail = {
    world,
    get game() {
      return GameSystem.instance;
    },
  };
});
