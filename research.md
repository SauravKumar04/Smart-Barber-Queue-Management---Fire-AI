# Smart-Barber-Queue-Management — Research

## Problem
1. I spoke with a barber at the shop where I regularly get my haircut.
2. He said his shop is small and customers sometimes have to wait outside.
3. On busy days, waiting can be long even for a short service like beard shaving.
4. He said some customers leave and go to another salon instead of waiting.
5. I want to test a simple virtual queue so customers can wait elsewhere and return when their turn is near.

## Proposed solution
Customers scan a QR code, join a queue and see their position. The barber marks a service completed, which updates the queue and triggers an email to the next customer. I will use real observations from the shop to calculate typical waiting time. This is a proposed solution, not yet a tested result.

## Two existing solutions

**1. Waitwhile** — Supports online waitlists, QR joining and customer notifications. It covers more features than I need for one small shop. My proposed tool would focus only on a basic queue and email alerts.

**2. Fresha** — Provides appointment booking, scheduling and other barbershop management tools. My main problem is managing walk-in customers who are already waiting, rather than running a full booking system.

## Sources reviewed

**Source 1: InCue — Token System for Barber Shops and Salons**  
https://incue.in/blog/barber-shop-salon-token-system/
- Explains how crowded waiting areas and uncertain wait times can cause walk-in customers to leave.
- Describes QR tokens and a live queue link so customers can step out and return when their turn is near.
- Mentions limits such as the need for internet and that very small queues may not need a digital system.

**Source 2: ScanQueue — What 879 Real Barbershop Visits Taught Us About Walk-In Wait Times**  
https://scanqueue.com/blog/what-879-barbershop-visits-taught-us
- Analyses 879 walk-in visits across 18 barbershops in May 2026.
- Reports a median wait of 24 minutes, with longer waits during busy periods.
- Suggests that showing queue position and notifying customers can make waiting easier to manage. These figures are from ScanQueue's shops, not my barber's shop.

## Person being helped
- **Name:** Ravish Kumar Thakur
- **Role:** Barber at Masjid Chowk Hajipur Bihar
- **How I learned about the problem:** I asked him what problems he faces while running the shop.
