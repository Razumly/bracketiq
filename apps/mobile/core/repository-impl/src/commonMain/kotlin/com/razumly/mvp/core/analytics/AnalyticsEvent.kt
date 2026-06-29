package com.razumly.mvp.core.analytics

enum class AnalyticsEvent(val eventName: String) {
    UserSignedUp("user signed up"),
    UserLoggedIn("user logged in"),
    OrganizationCreated("organization created"),
    EventCreated("event created"),
    EventRegistrationStarted("event registration started"),
    EventRegistrationCompleted("event registration completed"),
    TeamCreated("team created"),
    TeamRegistrationStarted("team registration started"),
    TeamRegistrationCompleted("team registration completed"),
    CheckoutStarted("checkout started"),
    PaymentCompleted("payment completed"),
}
