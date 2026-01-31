from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass

import httpx


OPENROUTER_BASE_URL = os.getenv("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1").rstrip(
    "/"
)
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY")
OPENROUTER_MODEL = os.getenv("OPENROUTER_MODEL", "z-ai/glm-4.5-air:free")
OPENROUTER_TIMEOUT_S = float(os.getenv("OPENROUTER_TIMEOUT_S", "25"))

# Optional (recommended by OpenRouter; helps you see usage attribution in their dashboard)
OPENROUTER_APP_URL = os.getenv("OPENROUTER_APP_URL")
OPENROUTER_APP_NAME = os.getenv("OPENROUTER_APP_NAME", "EasyRelocate")


class OpenRouterError(RuntimeError):
    pass


class OpenRouterConfigError(OpenRouterError):
    pass


class OpenRouterProviderError(OpenRouterError):
    pass


@dataclass(frozen=True)
class HousingPostExtraction:
    title: str | None
    location_text: str | None
    price_value: float | None
    currency: str | None
    price_period: str | None


def _extract_json_object(text: str) -> dict[str, object]:
    raw = text.strip()
    if raw.startswith("```"):
        raw = re.sub(r"^```[a-zA-Z0-9_-]*\n?", "", raw)
        raw = re.sub(r"\n?```$", "", raw)
        raw = raw.strip()

    try:
        parsed = json.loads(raw)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    start = raw.find("{")
    end = raw.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise OpenRouterProviderError("Model did not return a JSON object")

    snippet = raw[start : end + 1]
    try:
        parsed2 = json.loads(snippet)
    except json.JSONDecodeError as e:
        raise OpenRouterProviderError("Model returned invalid JSON") from e
    if not isinstance(parsed2, dict):
        raise OpenRouterProviderError("Model did not return a JSON object")
    return parsed2


def _as_str(v: object) -> str | None:
    if not isinstance(v, str):
        return None
    s = v.strip()
    return s or None


def _as_float(v: object) -> float | None:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        f = float(v)
        if f == f and abs(f) != float("inf"):
            return f
        return None
    if isinstance(v, str):
        cleaned = v.strip().replace(",", "")
        m = re.search(r"-?\d+(?:\.\d+)?", cleaned)
        if not m:
            return None
        try:
            f = float(m.group(0))
        except ValueError:
            return None
        if f == f and abs(f) != float("inf"):
            return f
    return None


def _normalize_currency(v: object) -> str | None:
    s = _as_str(v)
    if not s:
        return None
    if s in {"$", "USD"}:
        return "USD"
    if s in {"€", "EUR"}:
        return "EUR"
    if s in {"£", "GBP"}:
        return "GBP"
    if re.fullmatch(r"[A-Z]{3}", s):
        return s
    return None


def _normalize_price_period(v: object) -> str | None:
    s = _as_str(v)
    if not s:
        return None
    s2 = s.lower()
    if s2 in {"month", "monthly", "per month", "/month"}:
        return "month"
    if s2 in {"night", "nightly", "per night", "/night"}:
        return "night"
    if s2 in {"total"}:
        return "total"
    return None


def extract_housing_post(text: str, *, page_url: str | None = None) -> HousingPostExtraction:
    if not OPENROUTER_API_KEY:
        raise OpenRouterConfigError("OPENROUTER_API_KEY is not set")

    selection = text.strip()
    if not selection:
        return HousingPostExtraction(
            title=None,
            location_text=None,
            price_value=None,
            currency=None,
            price_period=None,
        )

    selection = selection[:7000]

    system = (
        "You extract housing listing info from user-selected text. "
        "Return ONLY a JSON object (no markdown, no backticks). "
        "Use null for missing values. "
        "Do not invent facts that are not present in the text."
    )
    user = (
        "Extract the best possible housing listing fields from the selected text.\n"
        "\n"
        "Rules:\n"
        "- Focus on MONTHLY rent only. Ignore deposits, application fees, and one-time fees.\n"
        "- If the post gives weekly/daily pricing, convert to an estimated monthly rent:\n"
        "  - weekly -> weekly * 4.345\n"
        "  - nightly/daily -> nightly * 30\n"
        "- If multiple rents are mentioned, pick the primary rent.\n"
        "- If currency is unclear, use USD.\n"
        "- Location: prefer the most specific geocodable, privacy-preserving location mentioned.\n"
        "  Priority:\n"
        "  1) Cross-street / intersection / \"Near X & Y\" (best)\n"
        "  2) Neighborhood or ZIP + city/state\n"
        "  3) City/state\n"
        "  Formatting:\n"
        "  - If the text contains \"Near X & Y\" (or \"Near X and Y\"), set location_text to:\n"
        "    \"X & Y, City, State ZIP, Country\" when available.\n"
        "  - If a US 5-digit ZIP code is present, assume Country = USA.\n"
        "    If you recognize the state for that ZIP/city, include the state abbreviation.\n"
        "  - If the text says \"Near 101 & McLaughlin Ave\" in a US context, normalize \"101\" -> \"US-101\".\n"
        "  - Do NOT include personal contact details in location_text (phone/email).\n"
        "\n"
        "Return JSON with keys:\n"
        '- title: string|null (short name)\n'
        '- location_text: string|null (best location string per rules above)\n'
        '- price_value: number|null (monthly)\n'
        '- currency: string|null (USD/EUR/GBP/...) \n'
        '- price_period: string|null (must be \"month\" when price_value exists, else null)\n'
        "\n"
        "Examples:\n"
        "- Input: \"Near 101 & McLaughlin Ave) San Jose 95121\" ->\n"
        "  location_text: \"US-101 & McLaughlin Ave, San Jose, CA 95121, USA\" (if CA/USA is implied)\n"
        "\n"
        f"page_url: {page_url or ''}\n"
        "\n"
        "selected_text:\n"
        f"{selection}\n"
    )

    headers: dict[str, str] = {"Authorization": f"Bearer {OPENROUTER_API_KEY}"}
    if OPENROUTER_APP_URL:
        headers["HTTP-Referer"] = OPENROUTER_APP_URL
    if OPENROUTER_APP_NAME:
        headers["X-Title"] = OPENROUTER_APP_NAME

    res = httpx.post(
        f"{OPENROUTER_BASE_URL}/chat/completions",
        headers=headers,
        json={
            "model": OPENROUTER_MODEL,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.0,
        },
        timeout=OPENROUTER_TIMEOUT_S,
    )
    res.raise_for_status()
    data = res.json()
    if not isinstance(data, dict):
        raise OpenRouterProviderError("OpenRouter returned an invalid response")

    choices = data.get("choices")
    if not isinstance(choices, list) or not choices:
        raise OpenRouterProviderError("OpenRouter returned no choices")

    msg = choices[0].get("message")
    if not isinstance(msg, dict):
        raise OpenRouterProviderError("OpenRouter returned an invalid message")

    content = msg.get("content")
    if not isinstance(content, str) or not content.strip():
        raise OpenRouterProviderError("OpenRouter returned empty content")

    obj = _extract_json_object(content)

    title = _as_str(obj.get("title"))
    location_text = _as_str(obj.get("location_text"))
    if location_text:
        location_text = location_text.strip().strip(",").strip()
    price_value = _as_float(obj.get("price_value"))
    currency = _normalize_currency(obj.get("currency")) or ("USD" if price_value else None)

    price_period = _normalize_price_period(obj.get("price_period"))
    if price_value is not None:
        price_period = "month"
    else:
        price_period = None

    return HousingPostExtraction(
        title=title,
        location_text=location_text,
        price_value=price_value,
        currency=currency,
        price_period=price_period,
    )
