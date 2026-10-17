# Demonstration (H-05)

**The demonstration is given live** on the deployed dashboard at the hackathon showcase. There is
no recorded video. The event asks for the public repository plus a working prototype deployed live
to Posit Connect, and the live dashboard is that demo.

To follow the same demonstration yourself:
- [`demo/README.md`](../README.md): the written step-by-step walkthrough of every dataset (Jingyao), with exact settings and the numbers the tool shows.
- [SCRIPT.md](SCRIPT.md): the order and talking points used for the live session (about 3 minutes), with the tool's actual numbers.

## Live session flow

1. Open the dashboard. A first visit loads the synthetic `zone_shift.csv` example and opens Zone Monitoring.
2. Click **Confirm all usable baselines**. Zone A shows 8 high-signal days above its 25.1% limit; zone B shows none.
3. Hover the chart and click September 22: 41 of 100 responses were late. The slowest arrivals appear below.
4. On **Data & Settings**, use **Try an example** to load the real NYC extract (priority 2), then confirm Brooklyn and Queens: 8 high-signal days.
5. Optionally load `edge_cases.csv` to show excluded rows, insufficient data and the provisional current day.

The numbers above are verified in the browser on the live site; see [`app/frontend/acceptance/`](../../app/frontend/acceptance/README.md).
