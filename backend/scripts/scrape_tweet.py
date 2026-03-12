#!/usr/bin/env python3
"""Scrape the latest tweet from a Twitter/X user using Scrapling."""

import sys
import json


def scrape_latest_tweet(username: str) -> dict:
    try:
        from scrapling import StealthyFetcher
    except ImportError:
        return {
            "ok": False,
            "error": "scrapling not installed. Run: pip install scrapling && scrapling install",
        }

    url = f"https://x.com/{username}"

    try:
        page = StealthyFetcher().fetch(url, headless=True, network_idle=True, wait=3)

        tweets = page.css('[data-testid="tweet"]')

        if not tweets:
            return {"ok": False, "error": f"No tweets found for @{username}", "username": username}

        latest = tweets[0]

        # Tweet text (content lives in child spans)
        text_el = latest.css('[data-testid="tweetText"]')
        if text_el:
            spans = text_el[0].css("span")
            tweet_text = " ".join(s.text for s in spans if s.text)
        else:
            tweet_text = ""

        # Timestamp
        time_el = latest.css("time")
        timestamp = ""
        if time_el:
            timestamp = time_el[0].attrib.get("datetime", "")

        # Tweet URL
        tweet_url = url
        links = latest.css('a[href*="/status/"]')
        if links:
            href = links[0].attrib.get("href", "")
            if href:
                tweet_url = f"https://x.com{href}"

        return {
            "ok": True,
            "username": username,
            "text": tweet_text,
            "timestamp": timestamp,
            "url": tweet_url,
        }
    except Exception as e:
        return {"ok": False, "error": str(e), "username": username}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "Usage: scrape_tweet.py <username>"}))
        sys.exit(1)

    result = scrape_latest_tweet(sys.argv[1])
    print(json.dumps(result, ensure_ascii=False))
