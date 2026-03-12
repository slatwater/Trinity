#!/usr/bin/env python3
"""Scrape the latest tweet from a Twitter/X user using Scrapling."""

import sys
import json
import os

COOKIE_FILE = os.path.join(os.path.expanduser("~"), ".trinity", "news", "x_cookies.json")


def load_cookies():
    """Load X.com auth cookies from ~/.trinity/news/x_cookies.json"""
    if not os.path.exists(COOKIE_FILE):
        return None
    try:
        with open(COOKIE_FILE) as f:
            data = json.load(f)
        # Require at least auth_token
        if data.get("auth_token"):
            return data
        return None
    except (json.JSONDecodeError, IOError):
        return None


def make_page_action(cookies):
    """Inject X.com cookies and reload to get authenticated timeline."""
    if not cookies:
        return None

    def action(page):
        cookie_list = [
            {"name": name, "value": value, "domain": ".x.com", "path": "/"}
            for name, value in cookies.items()
            if value  # skip empty values
        ]
        page.context.add_cookies(cookie_list)
        page.reload(wait_until="domcontentloaded")
        page.wait_for_selector('[data-testid="tweet"]', timeout=15000)
        page.wait_for_timeout(2000)
        return page

    return action


def translate_to_chinese(text: str) -> str:
    """Translate text to Chinese via Google Translate."""
    if not text:
        return text
    try:
        from deep_translator import GoogleTranslator
        return GoogleTranslator(source="auto", target="zh-CN").translate(text)
    except Exception:
        return text


def scrape_latest_tweet(username: str) -> dict:
    try:
        from scrapling import StealthyFetcher
    except ImportError:
        return {
            "ok": False,
            "error": "scrapling not installed. Run: pip install scrapling && scrapling install",
        }

    url = f"https://x.com/{username}"
    cookies = load_cookies()

    try:
        fetch_kwargs = dict(headless=True, network_idle=True, wait=3000, timeout=45000)
        page_action = make_page_action(cookies)
        if page_action:
            fetch_kwargs["page_action"] = page_action

        page = StealthyFetcher().fetch(url, **fetch_kwargs)

        tweets = page.css('[data-testid="tweet"]')

        if not tweets:
            return {"ok": False, "error": f"No tweets found for @{username}", "username": username}

        # Collect original posts (skip replies and retweets)
        candidates = []
        for tweet in tweets[:10]:
            if len(candidates) >= 2:
                break

            full_text = tweet.text or ""
            if "Replying to @" in full_text:
                continue

            links = tweet.css('a[href*="/status/"]')
            tweet_url = url
            is_retweet = False
            if links:
                href = links[0].attrib.get("href", "")
                if href:
                    tweet_url = f"https://x.com{href}"
                    parts = href.strip("/").split("/")
                    if parts and parts[0].lower() != username.lower():
                        is_retweet = True
            if is_retweet:
                continue

            time_el = tweet.css("time")
            ts = time_el[0].attrib.get("datetime", "") if time_el else ""

            text_el = tweet.css('[data-testid="tweetText"]')
            if text_el:
                spans = text_el[0].css("span")
                text = " ".join(s.text for s in spans if s.text)
            else:
                text = ""

            candidates.append({"ts": ts, "text": text, "url": tweet_url})

        if not candidates:
            return {"ok": False, "error": f"No original posts found for @{username}", "username": username}

        # If first post is >24h older than second, it's likely pinned — take the second
        best = candidates[0]
        if len(candidates) > 1 and candidates[0]["ts"] and candidates[1]["ts"]:
            from datetime import datetime, timedelta
            try:
                t0 = datetime.fromisoformat(candidates[0]["ts"].replace("Z", "+00:00"))
                t1 = datetime.fromisoformat(candidates[1]["ts"].replace("Z", "+00:00"))
                if t1 - t0 > timedelta(hours=24):
                    best = candidates[1]
            except (ValueError, TypeError):
                pass

        return {
            "ok": True,
            "username": username,
            "text": translate_to_chinese(best["text"]),
            "timestamp": best["ts"],
            "url": best["url"],
        }
    except Exception as e:
        return {"ok": False, "error": str(e), "username": username}


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "Usage: scrape_tweet.py <username>"}))
        sys.exit(1)

    result = scrape_latest_tweet(sys.argv[1])
    print(json.dumps(result, ensure_ascii=False))
