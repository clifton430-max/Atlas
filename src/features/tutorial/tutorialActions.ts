/**
 * Tour lifecycle. Starting a tour switches the app into the disposable
 * sandbox workspace (see WorkspaceProvider); ending it discards the sandbox
 * and resets tour-only UI state, so nothing from the tour leaks into real use.
 */
import { EMPTY_FILTERS } from '@/features/discover/filters';
import { uiStore } from '@/app/store';
import { getSandboxWorkspace } from '@/features/workspace/WorkspaceProvider';
import { CHAPTERS, firstStepOfChapter, STEPS } from './steps';
import { tutorialStore } from './tutorialStore';

const resetTourUi = () =>
  uiStore.set({
    selectedEventId: null, selectedPinId: null, selectedSharedPinId: null, placingPin: false, newPinAt: null,
    movingPinId: null, moveTarget: null, discoverFilters: EMPTY_FILTERS, discoverKeyword: '',
    leftPanelOpen: true, rightPanelOpen: true,
  });

/** Starting mid-tour needs the practice data earlier chapters would have created. */
function seedSandboxFor(chapter: number) {
  const ws = getSandboxWorkspace();
  if (chapter < 3 || ws.snapshot().pins.length) return;
  try {
    const map = ws.snapshot().maps[0] ?? ws.createMap({ name: 'Practice map' });
    const group = ws.snapshot().groups[0] ?? ws.createGroup({ name: 'Practice', color: '#2f5bea' });
    ws.createCustomPin({ mapId: map.id, title: 'Practice pin', latitude: 40.758, longitude: -73.9855, groupIds: [group.id] });
  } catch {
    /* storage unavailable: steps fall back gracefully */
  }
}

export function startTour(chapter = 0) {
  const sandbox = getSandboxWorkspace();
  if (chapter === 0) sandbox.destroy();
  seedSandboxFor(chapter);
  resetTourUi();
  tutorialStore.set({ active: true, stepIndex: firstStepOfChapter(chapter), firstRunHandled: true });
}

export function goToStep(index: number) {
  tutorialStore.set({ stepIndex: Math.max(0, Math.min(STEPS.length - 1, index)) });
}

/** End the tour. The sandbox is always discarded. */
export function endTour(completed: boolean) {
  getSandboxWorkspace().destroy();
  resetTourUi();
  tutorialStore.set({ active: false, stepIndex: 0, completed: tutorialStore.get().completed || completed, firstRunHandled: true });
}

export function dismissFirstRun() {
  tutorialStore.set({ firstRunHandled: true });
}

export { CHAPTERS };
