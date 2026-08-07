import { db } from '@/lib/db';
import { getWorkspaceId } from '@/lib/auth-helpers';
import { NextRequest, NextResponse } from 'next/server';
import { withTaskLock } from '@/lib/task-lock';
import { ConflictError, ValidationError } from '@/lib/errors';
import { withHandler } from '@/lib/api-handler';
import { z } from 'zod';

/**
 * SYNAPTIC PLASTICITY — Forgetting Curve Decay
 *
 * Unused associations weaken over time, mimicking synaptic decay.
 * - Associations not fired in N days decay proportionally to how long they've been idle
 * - Decay rate: 0.5% per day idle (exponential decay)
 * - Minimum weight: 0.05 (don't fully forget — some "innate" connection remains)
 * - Fact activation scores also decay (unused knowledge fades)
 *
 * This makes the network truly dynamic — connections that are useful get
 * strengthened by Hebbian learning, unused ones fade by synaptic plasticity.
 */

const plasticitySchema = z.object({
  decayRate: z.number().min(0.001).max(0.5).optional().default(0.005),
  minWeight: z.number().min(0.01).max(0.5).optional().default(0.05),
  dryRun: z.boolean().optional().default(false),
});

export const POST = withHandler(async (request: NextRequest) => {
  const workspaceId = await getWorkspaceId(request);

  // Validate input
  const body = await request.json().catch(() => ({}));
  const parsed = plasticitySchema.safeParse(body);
  if (!parsed.success) {
    throw new ValidationError('Invalid plasticity parameters', parsed.error.flatten());
  }
  const { decayRate, minWeight, dryRun } = parsed.data;

  // Overlap protection — prevent concurrent plasticity runs
  const result = await withTaskLock(workspaceId, 'plasticity', async () => {
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);

    // Get all associations for this workspace
    const associations = await db.association.findMany({
      where: { workspaceId },
    });

    let decayedCount = 0;
    let totalDecay = 0;
    let strengthenedCount = 0;
    let totalStrengthen = 0;
    const details: {
      id: number;
      label: string;
      oldWeight: number;
      newWeight: number;
      daysIdle: number;
    }[] = [];

    for (const assoc of associations) {
      const lastFired = assoc.lastFiredAt
        ? new Date(assoc.lastFiredAt).getTime()
        : 0;
      const created = new Date(assoc.createdAt).getTime();
      const now = Date.now();

      // Days since last fired (or since creation if never fired)
      const referenceTime = lastFired || created;
      const daysIdle = (now - referenceTime) / (1000 * 60 * 60 * 24);

      // Exponential decay: weight *= (1 - decayRate)^daysIdle
      const decayFactor = Math.pow(1 - decayRate, daysIdle);
      let newWeight = assoc.activationWeight * decayFactor;

      // Don't go below minimum
      newWeight = Math.max(newWeight, minWeight);

      // Also consider fire count — heavily used associations resist decay
      // This is "long-term potentiation": frequently activated synapses are harder to decay
      if (assoc.fireCount > 5) {
        const ltpBonus = Math.min(assoc.fireCount * 0.005, 0.15);
        newWeight = Math.min(newWeight + ltpBonus, 1.0);
        strengthenedCount++;
        totalStrengthen += ltpBonus;
      }

      const diff = newWeight - assoc.activationWeight;

      if (Math.abs(diff) > 0.001) {
        if (diff < 0) {
          decayedCount++;
          totalDecay += Math.abs(diff);
        }

        details.push({
          id: assoc.id,
          label: `${assoc.label} (fired ${assoc.fireCount}×)`,
          oldWeight: Math.round(assoc.activationWeight * 1000) / 1000,
          newWeight: Math.round(newWeight * 1000) / 1000,
          daysIdle: Math.round(daysIdle),
        });

        if (!dryRun) {
          await db.association.update({
            where: { id: assoc.id },
            data: { activationWeight: newWeight },
          });
        }
      }
    }

    // Also decay fact activation scores
    const facts = await db.fact.findMany({
      where: {
        workspaceId,
        activationScore: { gt: 0 },
        supersededBy: null,
      },
    });

    let factsDecayed = 0;
    for (const fact of facts) {
      const lastAct = fact.lastActivatedAt
        ? new Date(fact.lastActivatedAt).getTime()
        : 0;
      if (!lastAct) continue;
      const daysIdle = (Date.now() - lastAct) / (1000 * 60 * 60 * 24);
      if (daysIdle < 1) continue;

      const decayFactor = Math.pow(0.95, daysIdle); // 5% per day for facts
      const newScore = fact.activationScore * decayFactor;

      if (newScore < 0.01) {
        if (!dryRun) {
          await db.fact.update({
            where: { id: fact.id },
            data: { activationScore: 0, lastActivatedAt: null },
          });
        }
        factsDecayed++;
      } else if (Math.abs(newScore - fact.activationScore) > 0.005) {
        if (!dryRun) {
          await db.fact.update({
            where: { id: fact.id },
            data: { activationScore: Math.round(newScore * 1000) / 1000 },
          });
        }
        factsDecayed++;
      }
    }

    return {
      dryRun,
      applied: !dryRun,
      timestamp,
      summary: {
        totalAssociations: associations.length,
        decayed: decayedCount,
        strengthened: strengthenedCount, // LTP-protected
        unchanged: associations.length - decayedCount - strengthenedCount,
        avgDecay:
          decayedCount > 0
            ? Math.round((totalDecay / decayedCount) * 1000) / 1000
            : 0,
        factsDecayed,
        decayRate,
        minWeight,
      },
      topChanges: details
        .sort(
          (a, b) =>
            Math.abs(a.newWeight - a.oldWeight) -
            Math.abs(b.newWeight - b.oldWeight),
        )
        .slice(0, 10),
    };
  });

  if (result && typeof result === 'object' && 'success' in result && result.success === false) {
    throw new ConflictError('Plasticity run is already in progress for this workspace');
  }

  return NextResponse.json(result);
});