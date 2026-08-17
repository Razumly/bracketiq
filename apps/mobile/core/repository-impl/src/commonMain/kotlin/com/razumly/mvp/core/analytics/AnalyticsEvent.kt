package com.razumly.mvp.core.analytics

enum class AnalyticsEvent(val eventName: String) {
    UserSignedUp("user signed up"),
    UserLoggedIn("user logged in"),
    OrganizationCreated("organization created"),
    EventCreated("event created"),
    EventClicked("event clicked"),
    EventRegistrationStarted("event registration started"),
    EventRegistrationCompleted("event registration completed"),
    EventOutboundClicked("event outbound clicked"),
    RentalClicked("rental clicked"),
    RentalCheckoutStarted("rental checkout started"),
    RentalOutboundClicked("rental outbound clicked"),
    TeamCreated("team created"),
    TeamRegistrationStarted("team registration started"),
    TeamRegistrationCompleted("team registration completed"),
    CheckoutStarted("checkout started"),
    PaymentCompleted("payment completed"),
}
