NeighbourLink User Workflows

This document describes the main user journeys in NeighbourLink from a user-facing perspective. It complements the technical architecture, API, database, setup, and deployment documentation.

1. General User Journey

Open NeighbourLink
        |
        v
 Sign in / OTP Login
        |
        v
  Choose what you need
     /           \
    v             v
Rent an Item   Find Local Help
    |             |
    v             v
Browse Items   Request Help
    |             |
    v             v
View Details   Receive Quotes
     \            /
      \          /
       v        v
      Select Offer / Provider
              |
              v
            Book
              |
              v
       Manage Agreement
              |
              v
         Demo Payment
              |
              v
       Rental / Service
              |
              v
           Review
              |
              v
     Refund / Dispute
       (if required)

2. Item Rental Flow

The item rental journey allows users to discover nearby items and request them for a required period.

Steps

1. User signs in to NeighbourLink.
2. User browses available item listings.
3. User opens a listing to view its details.
4. User selects the required rental period.
5. User sends a rental request.
6. The item owner reviews the request.
7. The owner accepts or rejects the request.
8. If accepted, the booking/agreement can proceed.
9. The user completes the documented demo payment flow.
10. The rental takes place.
11. After completion, the user can leave a review.
12. If an issue occurs, the user can use the available dispute workflow.

Flow

Browse Items
     |
     v
View Item
     |
     v
Select Rental Period
     |
     v
Send Request
     |
     v
Owner Decision
   /       \
  v         v
Accept    Reject
  |
  v
Agreement
  |
  v
Demo Payment
  |
  v
Rental
  |
  v
Review / Dispute

3. Local Help Flow

The local-help journey connects users who need help with suitable local providers.

Steps

1. User signs in.
2. User describes the required service/help.
3. Relevant providers can respond to the request.
4. Providers may submit quotes.
5. User compares available quotes.
6. User selects a suitable provider.
7. User books the provider.
8. The agreement and booking status are managed through the application.
9. The documented demo payment flow is completed.
10. The provider performs the service.
11. User can leave a review after completion.
12. A dispute can be raised if an issue occurs.

Flow

Request Local Help
        |
        v
Receive Provider Quotes
        |
        v
Compare Quotes
        |
        v
Select Provider
        |
        v
Book Service
        |
        v
Agreement
        |
        v
Demo Payment
        |
        v
Service
        |
        v
Review / Dispute

4. Provider Flow

Providers can manage their profile and respond to customer requests.

Provider Account
       |
       v
Create / Update Profile
       |
       v
Add Services / Availability
       |
       v
Receive Requests
       |
       v
Review Request
     /     \
    v       v
 Accept   Reject
    |
    v
 Booking
    |
    v
Service in Progress
    |
    v
Complete Service
    |
    v
Customer Review

Provider responsibilities

- Keep profile information up to date.
- Maintain available services.
- Respond to customer requests.
- Provide accurate quotes where applicable.
- Keep booking status updated.
- Complete accepted services.
- Respond appropriately to disputes or issues.

5. Agreement and Payment Flow

An accepted booking can proceed through the agreement and documented payment workflow.

Accepted Booking
       |
       v
Create / Manage Agreement
       |
       v
Demo Checkout
       |
       v
Payment Recorded
       |
       v
Booking / Service
       |
       +----------------+
       |                |
       v                v
   Completed        Cancelled
                        |
                        v
                  Demo Refund

«Note: Payments in this project are for demonstration purposes. This workflow should not be interpreted as real financial processing.»

6. Review Flow

Reviews should be associated with completed interactions.

General flow

Booking / Service Completed
           |
           v
      Review Option
           |
           v
      Submit Review
           |
           v
 Review Associated With
 Relevant User / Provider /
 Listing / Interaction

Reviews help users understand previous experiences and provide feedback about the interaction.

7. Dispute Flow

If a user encounters an issue with a booking, service, rental, or transaction, the dispute workflow can be used where supported.

Steps

1. Open the relevant booking or transaction.
2. Use the available dispute/reporting mechanism.
3. Provide the relevant information.
4. Submit the dispute.
5. The issue can be reviewed through the application's dispute/admin workflow.
6. Any resulting status change or demo refund should be reflected in the relevant records.

Flow

Issue Occurs
     |
     v
Open Relevant Record
     |
     v
Raise Dispute
     |
     v
Provide Details
     |
     v
Dispute Review
     |
     +----------------+
     |                |
     v                v
Resolved          Further Action
     |
     v
Status / Refund Updated

8. Admin Flow

Administrators can monitor and manage platform-level activities.

Admin Login
    |
    +--> Review Users
    |
    +--> Review Providers
    |
    +--> Monitor Bookings
    |
    +--> Review Transactions
    |
    +--> Review Disputes
    |
    +--> Manage Platform Issues

Typical admin responsibilities

- Review platform activity.
- Monitor users and providers.
- Review reported issues.
- Monitor bookings and transactions.
- Handle disputes according to the available platform workflow.
- Identify operational issues requiring attention.

9. Workflow Status Vocabulary

The following terms should be used consistently when describing NeighbourLink workflows.

Status| Meaning
Pending| A request is waiting for the next action or decision.
Accepted| The relevant provider or owner has accepted the request.
Active| The booking or service is currently in progress.
Completed| The booking or service has finished successfully.
Cancelled| The booking was cancelled before completion.
Refunded| A demo payment has been recorded as refunded.
Disputed| A user has raised an issue requiring review.

10. Quick Reference

User Type| Main Journey
Customer| Browse → Request/Book → Agreement → Payment → Complete → Review
Item Owner| List Item → Receive Request → Accept → Rental → Complete
Service Provider| Profile → Receive Request → Quote/Accept → Service → Complete
Admin| Monitor → Review → Resolve Issues
Customer with Issue| Booking → Dispute → Review → Resolution/Refund

11. Related Documentation

For implementation and technical details, refer to:

- "Project Plan" (project-plan.md)
- "Progress" (progress.md)
- "Setup" (setup.md)
- "Architecture Decisions" (decisions.md)
- "Database Guide" (database.md)
- "API Guide" (api.md)
- "Payments" (payments.md)
- "Test Results" (test-results.md)
- "Acceptance Checklist" (acceptance-checklist.md)
- "Demo Script" (demo-script.md)
- "GCP Deployment" (gcp-deployment.md)
