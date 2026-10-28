import os
import json
import logging
import re
import httpx
from typing import Any
from backend.schemas import AIAnalysisResult

logger = logging.getLogger("ai_service")

ALLOWED_CATEGORIES = [
    "IT & Systems",
    "Facilities & Maintenance",
    "Billing & Finance",
    "Human Resources",
    "Academic & Training",
    "General"
]

ALLOWED_SENTIMENTS = ["Escalated", "Frustrated", "Neutral", "Positive"]
ALLOWED_PRIORITIES = ["Low", "Medium", "High", "Urgent"]

def _has_keyword(text: str, keywords: list[str]) -> bool:
    # Leading word-boundary prevents false hits like "ac" inside "back"/"workplace"
    return any(re.search(r"\b" + re.escape(kw), text) for kw in keywords)

def fallback_heuristic_analysis(
    title: str, 
    description: str, 
    staff_members: list[dict] | None = None
) -> AIAnalysisResult:
    """
    Deterministic rule-based AI engine used as a seamless fallback when external
    AI keys are unconfigured, rate-limited, or unavailable.
    """
    text = f"{title} {description}".lower()

    # 1. Classification Heuristics
    category = "General"
    if _has_keyword(text, ["wifi", "internet", "login", "password", "server", "email", "computer", "software", "bug", "network", "system", "app", "database", "screen", "keyboard", "laptop", "printer"]):
        category = "IT & Systems"
        category_key = "it"
    elif _has_keyword(text, ["ac", "air conditioning", "water", "leak", "clean", "elevator", "door", "room", "light", "power", "electricity", "chair", "desk", "building", "toilet", "washroom", "plumbing", "pipe", "heat"]):
        category = "Facilities & Maintenance"
        category_key = "facilities"
    elif _has_keyword(text, ["refund", "charge", "payment", "fee", "bill", "invoice", "bank", "receipt", "salary", "pay", "cost", "money", "transaction"]):
        category = "Billing & Finance"
        category_key = "billing"
    elif _has_keyword(text, ["manager", "harassment", "policy", "colleague", "behavior", "leave", "paycheck", "hr", "workplace", "conduct", "discrimination"]):
        category = "Human Resources"
        category_key = "hr"
    elif _has_keyword(text, ["course", "exam", "grade", "certificate", "class", "schedule", "assignment", "teacher", "trainer", "lecture"]):
        category = "Academic & Training"
        category_key = "academic"
    else:
        category_key = "general"

    # 2. Sentiment Analysis Heuristics
    sentiment = "Neutral"
    if _has_keyword(text, ["unacceptable", "lawyer", "legal", "court", "report", "sue", "furious", "outraged", "escalated", "sue you"]):
        sentiment = "Escalated"
    elif _has_keyword(text, ["angry", "broken", "worst", "ridiculous", "terrible", "useless", "disappointed", "urgent", "fix this", "again", "delay", "slow", "fail", "failed", "frustrated"]):
        sentiment = "Frustrated"
    elif _has_keyword(text, ["thank", "thanks", "good", "appreciate", "helpful", "great", "minor"]):
        sentiment = "Positive"

    # 3. Priority Suggestion
    priority = "Medium"
    if sentiment == "Escalated" or _has_keyword(text, ["hazard", "fire", "smoke", "danger", "immediately", "emergency", "system down", "critical", "crash", "security breach"]):
        priority = "Urgent"
    elif sentiment == "Frustrated" or _has_keyword(text, ["asap", "urgent", "blocked", "cannot work", "broken", "outage"]):
        priority = "High"
    elif sentiment == "Positive" or _has_keyword(text, ["minor", "suggestion", "small", "typo", "feedback"]):
        priority = "Low"

    # 4. Summary Generation
    clean_desc = description.strip()
    sentences = [s.strip() for s in clean_desc.replace("\n", ". ").split(".") if s.strip()]
    if len(sentences) >= 2:
        short_summary = f"{title}: {sentences[0]}. {sentences[1]}."
    elif len(sentences) == 1:
        short_summary = f"{title}: {sentences[0]}."
    else:
        short_summary = f"{title}: {clean_desc[:120]}..."

    if len(short_summary) > 200:
        short_summary = short_summary[:197] + "..."

    # 5. Suggested Staff Assignment Logic
    suggested_staff_id = None
    if staff_members and len(staff_members) > 0:
        # Match staff by category keyword in full_name/username or pick lowest workload staff
        matched_staff = None
        for s in staff_members:
            s_info = f"{s.get('username', '')} {s.get('full_name', '')}".lower()
            if category_key in s_info:
                matched_staff = s["id"]
                break
        
        if not matched_staff:
            # Fall back to picking staff with lowest active workload
            staff_members_sorted = sorted(staff_members, key=lambda x: x.get("active_count", 0))
            suggested_staff_id = staff_members_sorted[0]["id"]
        else:
            suggested_staff_id = matched_staff

    return AIAnalysisResult(
        category=category,
        sentiment=sentiment,
        priority=priority,
        ai_summary=short_summary,
        suggested_staff_id=suggested_staff_id,
        provider_used="rule_engine_fallback"
    )

def analyze_complaint_with_ai(
    title: str, 
    description: str, 
    staff_members: list[dict] | None = None
) -> AIAnalysisResult:
    """
    Main AI analysis function. Calls external provider API if OPENAI_API_KEY is available.
    On any error, rate limit, timeout, or missing key, seamlessly invokes fallback engine.
    """
    openai_key = os.getenv("OPENAI_API_KEY") or os.getenv("AI_API_KEY")

    if not openai_key:
        return fallback_heuristic_analysis(title, description, staff_members)

    prompt = f"""You are an AI complaint triage assistant. Analyze this complaint and return a JSON object.

Complaint Title: {title}
Complaint Description: {description}

Choose exact values:
- category: one of {ALLOWED_CATEGORIES}
- sentiment: one of {ALLOWED_SENTIMENTS}
- priority: one of {ALLOWED_PRIORITIES}
- ai_summary: a 1-2 sentence executive summary (max 200 chars).

JSON structure:
{{
  "category": "...",
  "sentiment": "...",
  "priority": "...",
  "ai_summary": "..."
}}"""

    headers = {
        "Authorization": f"Bearer {openai_key}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": os.getenv("AI_MODEL", "gpt-4o-mini"),
        "messages": [
            {"role": "system", "content": "You are a professional customer complaint triage AI. Respond strictly in JSON format."},
            {"role": "user", "content": prompt}
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.2
    }

    try:
        with httpx.Client(timeout=8.0) as client:
            response = client.post("https://api.openai.com/v1/chat/completions", headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()
            content_str = data["choices"][0]["message"]["content"]
            parsed = json.loads(content_str)

            category = parsed.get("category") if parsed.get("category") in ALLOWED_CATEGORIES else "General"
            sentiment = parsed.get("sentiment") if parsed.get("sentiment") in ALLOWED_SENTIMENTS else "Neutral"
            priority = parsed.get("priority") if parsed.get("priority") in ALLOWED_PRIORITIES else "Medium"
            ai_summary = parsed.get("ai_summary", f"{title}: {description[:120]}...")

            # Combine with staff recommendation heuristic
            fallback_res = fallback_heuristic_analysis(title, description, staff_members)

            return AIAnalysisResult(
                category=category,
                sentiment=sentiment,
                priority=priority,
                ai_summary=ai_summary,
                suggested_staff_id=fallback_res.suggested_staff_id,
                provider_used="openai"
            )

    except Exception as exc:
        logger.warning(f"External AI Provider call failed or timed out ({exc}). Using heuristic fallback.")
        return fallback_heuristic_analysis(title, description, staff_members)
