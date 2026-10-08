# Demo Guide

**Duration**: 10–15 Minutes

## Step 1: Start Infrastructure
Start the `PostgreSQL` instance, `Backend` (8000), `Collector` (5000), and `Frontend` (3000).

## Step 2: Start Endpoint Agent
Launch the Windows Agent from the Agent repository using the correct auth token.

## Step 3: Verify Heartbeat
Navigate to the Dashboard `Agents` page. Point out the `ONLINE` status, OS (Windows 11), and the "Last Heartbeat" timestamp.

## Step 4: Generate Telemetry
Execute a safe synthetic log in Powershell:
`Write-EventLog -LogName Application -Source "Application" -EventID 4624 -EntryType Information -Message "Demo Event"`

## Step 5: Live Events & WebSockets
Switch to the `Live Events` dashboard. Show the event appearing instantly without a page refresh.

## Step 6: Alerts & Investigation
Navigate to `Alerts`. Create an investigation from an alert, pivot to the `Host`, view the `Raw Evidence` JSON, and display the `Attack Timeline` graph.

## Step 7: Architecture & Limitations
Conclude by summarizing the distributed architecture and explaining the Windows `Security` channel Administrator limitation.
