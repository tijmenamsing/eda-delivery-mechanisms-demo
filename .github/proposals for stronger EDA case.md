## Proposals for stronger EDA case

There are a few changes I want to make because I feel like the EDA case is a bit weak in the current architecture.

- The polling flow doesn’t even use events (not published to eventbridge).
- The sse solution uses eventbridge but from what I understood it might as well not and have the blog update pushed to redis.
- The websockets chat solution also doesn’t use the event bus.

The presentation is about real time delivery for EDA backend, so i would like the architecture to have a more realistic EDA flow. Currently the event bus is almost decorative.
In a true event driven architecture, services don't share database.

Proposals:

1. Simulate two bounded contexts. One 'Editorial' and one 'Delivery'. The editorial context would be responsible for creating and updating articles and blog updates, and it would publish events to the event bus whenever an article or update is created. The delivery context would consume these events and be responsible for delivering the content to the users in real time. This way, we can demonstrate a more realistic EDA flow where services don't share a database and communicate through events.
2. The Editorial context would not need a database, for demo purposes it could just publish to the bus directly.
3. The Delivery context would have its own database (e.g., DynamoDB) where it stores the articles it receives from the event bus. The polling solution would then pool this database instead of the editorial one.
4. To incorporate EDA into the WebSockets solution, we could close all websockets whenever an editor closes the blog. Add a button in blog UI to close the blog, which would trigger an event to be published to the event bus. The WebSockets service would consume this event and send a graceful close message to all active Websockets connections and then close all of them for that blog.
5. The is an issue with the SSE solution in that it doesn't replay. New connections don't get the previous updates. To solve this we could switch to Redis Streams for SSE, which would allow us to replay events for new connections. The Delivery would listen for events and publish updates to a Redis Stream, and the SSE service would consume from that stream and push updates to clients in real time. This way, new clients can also receive past updates when they connect. What do you think of that proposal over using dynamodb + redis pub sub for the SSE solution?

Question:

1. Does every blog have its own isolated chatroom, or is there a shared chatroom for all blogs? It's blog should have its own isolated chatroom, as it would make more sense for users to discuss specific articles or updates in a dedicated space.

## Your task

1. Review the proposals and questions and provide feedback on them.
2. Ask for clarifying questions if needed.
3. Create a detailed plan for implementing the proposed changes, including any necessary architectural adjustments and the steps required to achieve the desired flow.
