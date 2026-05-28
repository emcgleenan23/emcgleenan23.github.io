"""
export_data.py
Reads shots.sqlite and writes data.json for the HTML dashboard.

Usage:
    python export_data.py [path/to/shots.sqlite] [path/to/data.json]

Defaults to ./database/shots.sqlite -> ./data.json
"""

import sqlite3
import json
import sys
import os

DB_PATH = sys.argv[1] if len(sys.argv) > 1 else "database/shots.sqlite"
OUT_PATH = sys.argv[2] if len(sys.argv) > 2 else "data.json"


def get_conn(path):
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def query(conn, sql, params=()):
    return [dict(r) for r in conn.execute(sql, params).fetchall()]


def main():
    if not os.path.exists(DB_PATH):
        sys.exit(f"Database not found: {DB_PATH}")

    conn = get_conn(DB_PATH)

    # (a,b,c) Player profile: full name, team, and anthro measurements.
    # YearsOfService included as a bonus dimension for the scatter/colouring.
    players = query(conn, """
        SELECT
            p.PlayerId                         AS playerId,
            p.FirstName || ' ' || p.LastName   AS fullName,
            p.YearsOfService                   AS yearsOfService,
            t.TeamName                         AS teamName,
            t.City                             AS teamCity,
            t.Abbr                             AS teamAbbr,
            a.Height                           AS height,
            a.Weight                           AS weight,
            a.VerticalJumpHeight               AS vertical,
            a.Reach                            AS reach,
            a.Wingspan                         AS wingspan,
            a.MaxSpeed                         AS maxSpeed
        FROM Players p
        LEFT JOIN Teams  t ON t.TeamId   = p.CurrentTeamId
        LEFT JOIN Anthro a ON a.PlayerId = p.PlayerId
        ORDER BY p.PlayerId
    """)

    # (d,e) Per player, per season: total shots and eFG%.
    # eFG% = (FGM + 0.5 * 3PM) / FGA
    #   Made          -> FGM
    #   Made & IsThree -> 3PM
    #   COUNT(*)      -> FGA
    per_season = query(conn, """
        SELECT
            s.ShooterId                                              AS playerId,
            s.Season                                                 AS season,
            COUNT(*)                                                 AS attempts,
            SUM(s.Made)                                              AS makes,
            SUM(CASE WHEN s.Made = 1 AND s.IsThree = 1 THEN 1 ELSE 0 END) AS threesMade,
            ROUND(
                100.0 * (SUM(s.Made) + 0.5 * SUM(CASE WHEN s.Made = 1 AND s.IsThree = 1 THEN 1 ELSE 0 END))
                / COUNT(*), 1)                                       AS efg
        FROM Shot s
        GROUP BY s.ShooterId, s.Season
        ORDER BY s.ShooterId, s.Season
    """)

    seasons = sorted({row["season"] for row in per_season})

    # Career totals per player (for the relationship/correlation views d+e aggregated).
    career = query(conn, """
        SELECT
            s.ShooterId                                              AS playerId,
            COUNT(*)                                                 AS attempts,
            SUM(s.Made)                                              AS makes,
            ROUND(
                100.0 * (SUM(s.Made) + 0.5 * SUM(CASE WHEN s.Made = 1 AND s.IsThree = 1 THEN 1 ELSE 0 END))
                / COUNT(*), 1)                                       AS efg
        FROM Shot s
        GROUP BY s.ShooterId
    """)

    # Index lookups so the front-end can stitch things together easily.
    career_by_player = {c["playerId"]: c for c in career}

    # Merge career shooting onto each player record -> single tidy array
    # that powers the player table, the correlation scatter (f) and the
    # anthro distribution histograms (g).
    for p in players:
        c = career_by_player.get(p["playerId"], {})
        p["careerAttempts"] = c.get("attempts", 0)
        p["careerMakes"] = c.get("makes", 0)
        p["careerEfg"] = c.get("efg", 0)

    payload = {
        "meta": {
            "source": os.path.basename(DB_PATH),
            "seasons": seasons,
            "playerCount": len(players),
            "anthroFields": [
                {"key": "height",   "label": "Height (in)"},
                {"key": "weight",   "label": "Weight (lb)"},
                {"key": "vertical", "label": "Vertical Jump (in)"},
                {"key": "reach",    "label": "Standing Reach (in)"},
                {"key": "wingspan", "label": "Wingspan (in)"},
                {"key": "maxSpeed", "label": "Max Speed (mph)"},
            ],
        },
        "players": players,        # a, b, c, + career shooting
        "perSeason": per_season,   # d, e
    }

    with open(OUT_PATH, "w") as f:
        json.dump(payload, f, indent=2)

    conn.close()
    print(f"Wrote {OUT_PATH}: {len(players)} players, "
          f"{len(per_season)} player-season rows, seasons {seasons}")


if __name__ == "__main__":
    main()