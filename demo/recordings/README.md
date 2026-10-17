# Demonstration (H-05)

**The demonstration is given live** on the deployed dashboard at the hackathon showcase. There is
no recorded video. The event asks for the public repository plus a working prototype deployed live
to Posit Connect, and the live dashboard is that demo.

To follow the same demonstration yourself:
- [`demo/README.md`](../README.md): the written step-by-step walkthrough of every dataset (Jingyao), with exact settings and the numbers the tool shows.
- [SCRIPT.md](SCRIPT.md): the order and talking points used for the live session (about 3 minutes), with the tool's actual numbers.

## Live session flow

1. Open the dashboard. A first visit loads the real NYC EMS extract (Brooklyn and Queens, priority 2) and opens Zone Monitoring.
2. Click **Confirm all usable baselines**. Brooklyn shows 6 high-signal days and Queens 2 (8 in total).
3. Select Queens and click September 6: 94 of 181 responses were late (51.9%, above its 45.1% limit). The slowest arrivals appear below.
4. On **Data & Settings**, use **Try an example** to load the synthetic `zone_shift.csv`, then confirm: zone A shows 8 high-signal days above its 25.1% limit; zone B shows none.
5. Optionally load `edge_cases.csv` to show excluded rows, insufficient data and the provisional current day.

The numbers above are verified in the browser on the live site; see [`app/frontend/acceptance/`](../../app/frontend/acceptance/README.md).
