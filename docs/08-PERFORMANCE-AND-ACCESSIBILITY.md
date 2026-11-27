# Performance and accessibility verification

## Proposed measurement

| Measure                           | Initial budget and method                                                                                                                                                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Action feedback                   | ≤250 ms p95 from input to visible feedback. Trace input, first frame, server acceptance and reconciliation independently.                                                                                                                                          |
| Command response                  | Confirmation or actionable timeout within 5 seconds on the agreed local network. Count timeouts separately. A timeout preserves the operation ID.                                                                                                                  |
| Queue and cross-session freshness | Exercise a 1,000-work-item dataset. Test foreground refresh and one visible scoped queue polling every 10 seconds. Proposed p95 second-employee observation ≤15 seconds on the local network. Confirm this target with the owner before considering subscriptions. |
| Cold launch and resources         | Measure time to usable work surface, list scroll jank and peak memory in a packaged build. Profile low memory, airplane mode and reconnection. Set budgets from a named representative device and approved workload.                                               |

Record hardware and OS, build and network, input path, sample count, p50/p95 and failures. Plan at least 50 samples per measured claim or pick action and report the measured dataset size, exact fixture revision and repetitions. Use a virtualized list, scoped query keys, focus/reconnect invalidation and bounded retry. Release the camera on screen blur. Track DB query counts and verify the page/snapshot cap without relying on rendering time as evidence of bounded state.

## Proposed accessibility checks

- Light and dark ordinary text 4.5:1, large text and applicable UI states 3:1. Check focus, text and meaningful icons on their actual backgrounds, including banner and modal overlays.
- TalkBack and VoiceOver order, label/copy agreement, one announcement per state change, restored focus after dismiss/update, keyboard and wedge focus, paste/password-manager support.
- Test 200% scaling, longest bundled locale and an RTL exercise, narrow handheld, tablet portrait/landscape, keyboard, safe areas and reduced motion. Verify one-handed access to confirm and shortage and a full manual path with camera denied.
- Explain unreachable or blocked checks in the [device matrix](DEVICE-COMPATIBILITY.md). Contrast calculations on proposed tokens and packaged behavioral accessibility are separately recorded. [React Native accessibility](https://reactnative.dev/docs/accessibility) · [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
