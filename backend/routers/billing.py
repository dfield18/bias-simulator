import os
import stripe
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from auth import get_current_user
from models import User

router = APIRouter()

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_WEBHOOK_SECRET = os.getenv("STRIPE_WEBHOOK_SECRET", "")
STRIPE_PRO_PRICE_ID = os.getenv("STRIPE_PRO_PRICE_ID", "")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

stripe.api_key = STRIPE_SECRET_KEY


@router.post("/billing/checkout")
async def create_checkout_session(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a Stripe Checkout session for upgrading to Pro."""
    if not STRIPE_SECRET_KEY:
        raise HTTPException(status_code=500, detail="Stripe is not configured. Set STRIPE_SECRET_KEY in environment variables.")
    if not STRIPE_PRO_PRICE_ID:
        raise HTTPException(status_code=500, detail="Stripe price not configured. Set STRIPE_PRO_PRICE_ID in environment variables.")

    if user.get("tier") == "pro":
        raise HTTPException(status_code=400, detail="Already on Pro plan")

    try:
        # Get or create Stripe customer
        result = await db.execute(select(User).where(User.id == user["id"]))
        db_user = result.scalar_one()

        if not db_user.stripe_customer_id:
            customer = stripe.Customer.create(
                email=db_user.email or "",
                metadata={"user_id": user["id"]},
            )
            db_user.stripe_customer_id = customer.id
            await db.commit()

        customer_id = db_user.stripe_customer_id

        session = stripe.checkout.Session.create(
            customer=customer_id,
            mode="subscription",
            line_items=[{"price": STRIPE_PRO_PRICE_ID, "quantity": 1}],
            success_url=f"{FRONTEND_URL}/dashboard?upgraded=true",
            cancel_url=f"{FRONTEND_URL}/pricing",
            metadata={"user_id": user["id"]},
        )

        return {"url": session.url}
    except stripe.error.StripeError as e:
        print(f"[Stripe] Checkout error: {e}")
        raise HTTPException(status_code=502, detail=f"Stripe error: {str(e)[:200]}")
    except Exception as e:
        print(f"[Stripe] Unexpected error: {e}")
        raise HTTPException(status_code=500, detail=f"Checkout error: {str(e)[:200]}")


@router.post("/billing/portal")
async def create_portal_session(
    user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a Stripe Customer Portal session for managing subscription."""
    if user.get("tier") not in ("pro", "admin"):
        raise HTTPException(status_code=403, detail="Only Pro users can access the billing portal")

    result = await db.execute(select(User).where(User.id == user["id"]))
    db_user = result.scalar_one()

    if not db_user.stripe_customer_id:
        raise HTTPException(status_code=400, detail="No billing account found")

    session = stripe.billing_portal.Session.create(
        customer=db_user.stripe_customer_id,
        return_url=f"{FRONTEND_URL}/dashboard",
    )

    return {"url": session.url}


@router.post("/billing/webhook")
async def stripe_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Handle Stripe webhook events."""
    payload = await request.body()
    sig_header = request.headers.get("stripe-signature", "")

    if not STRIPE_WEBHOOK_SECRET:
        print("[Stripe] WARNING: STRIPE_WEBHOOK_SECRET not set — rejecting webhook")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    try:
        event = stripe.Webhook.construct_event(
            payload, sig_header, STRIPE_WEBHOOK_SECRET
        )
    except (ValueError, stripe.error.SignatureVerificationError):
        raise HTTPException(status_code=400, detail="Invalid webhook signature")

    event_type = event["type"]
    data = event["data"]["object"]

    if event_type == "checkout.session.completed":
        # User completed checkout — upgrade to pro
        user_id = data.get("metadata", {}).get("user_id")
        customer_id = data.get("customer")
        if user_id:
            await db.execute(
                update(User)
                .where(User.id == user_id)
                .values(tier="pro", stripe_customer_id=customer_id)
            )
            await db.commit()
            print(f"[Stripe] User {user_id} upgraded to pro")
        elif customer_id:
            # Fallback: look up user by Stripe customer ID
            await db.execute(
                update(User)
                .where(User.stripe_customer_id == customer_id)
                .values(tier="pro")
            )
            await db.commit()
            print(f"[Stripe] Customer {customer_id} upgraded to pro (fallback)")
        else:
            print(f"[Stripe] WARNING: checkout.session.completed with no user_id or customer_id")

    elif event_type == "customer.subscription.updated":
        customer_id = data.get("customer")
        status = data.get("status")
        if customer_id:
            if status in ("active", "trialing"):
                new_tier = "pro"
            else:
                new_tier = "free"
            await db.execute(
                update(User)
                .where(User.stripe_customer_id == customer_id)
                .values(tier=new_tier)
            )
            await db.commit()
            print(f"[Stripe] Customer {customer_id} subscription {status} → tier={new_tier}")

    elif event_type == "customer.subscription.deleted":
        customer_id = data.get("customer")
        if customer_id:
            await db.execute(
                update(User)
                .where(User.stripe_customer_id == customer_id)
                .values(tier="free")
            )
            await db.commit()
            print(f"[Stripe] Customer {customer_id} subscription cancelled → tier=free")

    return {"status": "ok"}


@router.get("/billing/status")
async def get_billing_status(
    user: dict = Depends(get_current_user),
):
    """Get the current user's billing status."""
    return {
        "tier": user.get("tier", "free"),
        "is_pro": user.get("tier") == "pro",
    }
