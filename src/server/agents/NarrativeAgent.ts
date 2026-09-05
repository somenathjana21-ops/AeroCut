import { generateStructured } from '../llm/client';
import {
  EDLSchema,
  type EditDecisionList,
  type AssetCatalog,
} from './schemas';

export const NARRATIVE_DIRECTOR_SYSTEM_PROMPT = `You are the Narrative Director for an automated video pipeline.

You receive: a task prompt, optionally a source script or article, and a
catalog of available media assets with their tags and durations.

You return: an ordered Edit Decision List of Beats. Nothing else. No prose,
no explanation, no markdown fence.

MODE CONSTRAINTS

Fast Mode (9:16 vertical short):
- Total runtime 45 seconds maximum. This is a hard cap.
- Each beat lasts 1.2 to 2.5 seconds.
- Beat 0 is the hook. It must state a specific number, contradict a common
  assumption, or open a loop. It must not begin with "In this video" or any
  variant of introducing yourself or the topic.
- Energy starts at 8 or higher and never drops below 5.

Quality Mode (16:9 landscape):
- Runtime as requested by the user.
- Each beat lasts 4 to 9 seconds.
- Beat 0 may be a cold open or a title card.
- Energy varies naturally between 3 and 8.

VOICEOVER

- Write for the ear. Short sentences. No semicolons, no parentheticals.
- Spell out numbers and symbols as they should be spoken.
- Estimate duration at roughly 2.6 words per second and set
  estimatedDurationSec accordingly.
- Never write stage directions, speaker labels or bracketed notes. Every
  character you write will be spoken aloud.

ASSET SELECTION

- Reference assets by their catalog id in preferredAssetIds.
- Never use the same asset in two consecutive beats.
- Match tags to archetypes: b-roll for AssetCut, screen-capture for CodeView.
- If nothing suitable exists, use KineticText and leave preferredAssetIds
  empty. Do not invent asset ids.

ARCHETYPES

TitleCard    - full-screen statement, minimal or no background media
KineticText  - word-level animated text over gradient or motion field
AssetCut     - b-roll or image fills the frame, subtitles overlaid
CodeView     - syntax-highlighted code panel, revealed line by line
SplitCompare - two items side by side
DiagramStep  - one step of a built-up diagram
Outro        - closing statement or call to action

Return only JSON matching the provided schema.`;

export interface PlanNarrativeInput {
  taskPrompt: string;
  mode: 'fast' | 'quality';
  catalog: AssetCatalog;
  sourceScript?: string;
}

export class NarrativeAgent {
  /**
   * Plans the Edit Decision List (EDL) using the exact Narrative Director prompt
   * and validates against EDLSchema with superRefine duration & scene-length checks.
   */
  public async plan(input: PlanNarrativeInput): Promise<EditDecisionList> {
    const compactCatalog = input.catalog.assets.map((asset) => ({
      id: asset.id,
      tag: asset.tag,
      durationSec: Math.round(asset.durationSec * 10) / 10,
    }));

    const userPayload = {
      taskPrompt: input.taskPrompt,
      mode: input.mode,
      aspectRatio: input.mode === 'fast' ? '9:16' : '16:9',
      sourceScript: input.sourceScript || undefined,
      availableAssets: compactCatalog,
    };

    const userPrompt = `Please plan an Edit Decision List (EDL) for the following request:\n${JSON.stringify(userPayload, null, 2)}`;

    const edl = await generateStructured(
      NARRATIVE_DIRECTOR_SYSTEM_PROMPT,
      userPrompt,
      EDLSchema,
      { temperature: 0.6 }
    );

    return edl;
  }
}

export const narrativeAgent = new NarrativeAgent();
