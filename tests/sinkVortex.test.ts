/** Tests for the sinkVortex visual-effect utilities. */

import { VortexParticle, spawnVortexParticle, renderVortex } from '../src/visuals/sinkVortex';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a fake CanvasRenderingContext2D that records calls made on it. */
function makeFakeCtx(): CanvasRenderingContext2D & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    save:        () => { calls.push('save'); },
    restore:     () => { calls.push('restore'); },
    beginPath:   () => { calls.push('beginPath'); },
    arc:         () => { calls.push('arc'); },
    fill:        () => { calls.push('fill'); },
    fillStyle:   '',
    globalAlpha: 1,
  } as unknown as CanvasRenderingContext2D & { calls: string[] };
}

// ─── spawnVortexParticle ──────────────────────────────────────────────────────

describe('spawnVortexParticle', () => {
  it('adds a particle to an empty pool', () => {
    const particles: VortexParticle[] = [];
    spawnVortexParticle(particles);
    expect(particles.length).toBe(1);
  });

  it('does not exceed the maximum pool size', () => {
    const particles: VortexParticle[] = [];
    // Spawn far more particles than the max (18).
    for (let i = 0; i < 50; i++) spawnVortexParticle(particles);
    expect(particles.length).toBeLessThanOrEqual(18);
  });

  it('gives each particle a positive spawn radius', () => {
    const particles: VortexParticle[] = [];
    spawnVortexParticle(particles);
    expect(particles[0].spawnRadius).toBeGreaterThan(0);
  });

  it('gives each particle a positive duration', () => {
    const particles: VortexParticle[] = [];
    spawnVortexParticle(particles);
    expect(particles[0].duration).toBeGreaterThan(0);
  });

  it('gives each particle a positive angular speed', () => {
    const particles: VortexParticle[] = [];
    spawnVortexParticle(particles);
    expect(particles[0].angularSpeed).toBeGreaterThan(0);
  });

  it('gives each particle a positive dot size', () => {
    const particles: VortexParticle[] = [];
    spawnVortexParticle(particles);
    expect(particles[0].dotSize).toBeGreaterThan(0);
  });

  it('records a startTime near the current time', () => {
    const before = performance.now();
    const particles: VortexParticle[] = [];
    spawnVortexParticle(particles);
    const after = performance.now();
    expect(particles[0].startTime).toBeGreaterThanOrEqual(before);
    expect(particles[0].startTime).toBeLessThanOrEqual(after);
  });
});

// ─── renderVortex ─────────────────────────────────────────────────────────────

describe('renderVortex', () => {
  it('removes expired particles without drawing them', () => {
    const ctx = makeFakeCtx();
    // Build a particle that has already expired (startTime far in the past).
    const p: VortexParticle = {
      spawnRadius:  30,
      startAngle:   0,
      angularSpeed: 0.001,
      dotSize:      4,
      startTime:    performance.now() - 99999,
      duration:     100,
    };
    const particles = [p];
    renderVortex(ctx, particles, 100, 100, '#8e44ad');
    // The expired particle should have been removed.
    expect(particles.length).toBe(0);
    // No drawing commands should have been issued.
    expect(ctx.calls).not.toContain('fill');
  });

  it('draws live particles with save/restore guards', () => {
    const ctx = makeFakeCtx();
    // Particle that just spawned – elapsed ≈ 0 ms, well within its lifetime.
    const p: VortexParticle = {
      spawnRadius:  30,
      startAngle:   0,
      angularSpeed: 0.001,
      dotSize:      4,
      startTime:    performance.now(),
      duration:     5000,
    };
    const particles = [p];
    renderVortex(ctx, particles, 100, 100, '#8e44ad');
    // The particle should still be alive.
    expect(particles.length).toBe(1);
    // Each drawn particle must be wrapped in save/restore.
    expect(ctx.calls).toContain('save');
    expect(ctx.calls).toContain('restore');
    expect(ctx.calls).toContain('fill');
  });

  it('applies the supplied color to drawn particles', () => {
    const ctx = makeFakeCtx();
    const p: VortexParticle = {
      spawnRadius:  30,
      startAngle:   0,
      angularSpeed: 0.001,
      dotSize:      4,
      startTime:    performance.now(),
      duration:     5000,
    };
    renderVortex(ctx, [p], 0, 0, '#purple-test');
    expect((ctx as unknown as { fillStyle: string }).fillStyle).toBe('#purple-test');
  });

  it('leaves an empty particle pool unchanged and issues no draw calls', () => {
    const ctx = makeFakeCtx();
    renderVortex(ctx, [], 50, 50, '#8e44ad');
    expect(ctx.calls.length).toBe(0);
  });
});
