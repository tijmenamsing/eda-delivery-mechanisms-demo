import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  ScanCommand,
  BatchWriteCommand,
} from "@aws-sdk/lib-dynamodb";
import Redis from "ioredis";
import { randomUUID } from "node:crypto";
import { REDIS_STREAMS } from "@bbtg-news/types/constants";

const endpoint = process.env["DYNAMODB_ENDPOINT"];
const region = process.env["AWS_REGION"] ?? "eu-west-1";
const redisUrl = process.env["REDIS_URL"] ?? "redis://localhost:6379";

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region,
    ...(endpoint
      ? {
          endpoint,
          credentials: {
            accessKeyId: process.env["AWS_ACCESS_KEY_ID"] ?? "test",
            secretAccessKey: process.env["AWS_SECRET_ACCESS_KEY"] ?? "test",
          },
        }
      : {}),
  }),
  { marshallOptions: { removeUndefinedValues: true } },
);

// Editorial context tables
const editorialArticlesTable =
  process.env["EDITORIAL_ARTICLES_TABLE"] ?? "dev-editorial-articles";
const editorialBlogsTable =
  process.env["EDITORIAL_BLOGS_TABLE"] ?? "dev-editorial-blogs";
const editorialUpdatesTable =
  process.env["EDITORIAL_UPDATES_TABLE"] ?? "dev-editorial-updates";

// Delivery context tables
const deliveryArticlesTable =
  process.env["DELIVERY_ARTICLES_TABLE"] ?? "dev-delivery-articles";
const deliveryBlogsTable =
  process.env["DELIVERY_BLOGS_TABLE"] ?? "dev-delivery-blogs";
const deliveryUpdatesTable =
  process.env["DELIVERY_UPDATES_TABLE"] ?? "dev-delivery-updates";
const deliveryChatMessagesTable =
  process.env["DELIVERY_CHAT_MESSAGES_TABLE"] ?? "dev-delivery-chat-messages";

const blogId = "b1e5a3f0-1234-4abc-9def-000000000001";

/** Delete every item in a table in batches of 25. */
async function pruneTable(
  tableName: string,
  primaryKey: string,
  sortKey?: string,
): Promise<number> {
  let deleted = 0;
  let lastKey: Record<string, unknown> | undefined;

  do {
    const result = await client.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression: sortKey
          ? `${primaryKey}, ${sortKey}`
          : primaryKey,
        ExclusiveStartKey: lastKey,
      }),
    );

    const items = result.Items ?? [];
    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;

    for (let i = 0; i < items.length; i += 25) {
      const batch = items.slice(i, i + 25);
      await client.send(
        new BatchWriteCommand({
          RequestItems: {
            [tableName]: batch.map((item) => ({
              DeleteRequest: {
                Key: sortKey
                  ? { [primaryKey]: item[primaryKey], [sortKey]: item[sortKey] }
                  : { [primaryKey]: item[primaryKey] },
              },
            })),
          },
        }),
      );
      deleted += batch.length;
    }
  } while (lastKey);

  return deleted;
}

/** Put an item into both editorial and delivery tables. */
async function putBoth(
  editorialTable: string,
  deliveryTable: string,
  item: Record<string, unknown>,
): Promise<void> {
  await Promise.all([
    client.send(new PutCommand({ TableName: editorialTable, Item: item })),
    client.send(new PutCommand({ TableName: deliveryTable, Item: item })),
  ]);
}

async function seed(): Promise<void> {
  const isProd = !process.env["DYNAMODB_ENDPOINT"];
  const skipRedis = process.env["SKIP_REDIS"] === "true";

  if (isProd) {
    console.log("\n⚠️  PRODUCTION SEED — writing to real AWS DynamoDB\n");
  }
  console.log("\n🌱 Seeding demo data...\n");

  // Redis is optional — not reachable from a developer laptop when ElastiCache
  // is inside a VPC. Pass SKIP_REDIS=true to skip Stream writes (DynamoDB
  // data is still seeded; SSE history starts empty until updates are posted).
  const redis = skipRedis
    ? null
    : new Redis(redisUrl, { maxRetriesPerRequest: 3 });

  // Prune existing data in all tables
  console.log("🗑️  Pruning existing data...");
  const pruneResults = await Promise.all([
    pruneTable(editorialArticlesTable, "articleId"),
    pruneTable(editorialBlogsTable, "blogId"),
    pruneTable(editorialUpdatesTable, "updateId"),
    pruneTable(deliveryArticlesTable, "articleId"),
    pruneTable(deliveryBlogsTable, "blogId"),
    pruneTable(deliveryUpdatesTable, "updateId"),
    pruneTable(deliveryChatMessagesTable, "messageId"),
  ]);
  const total = pruneResults.reduce((sum, n) => sum + n, 0);
  console.log(`  Deleted ${total} items across all tables\n`);

  // Also clear Redis Streams (skipped when Redis is not reachable)
  const streamKey = REDIS_STREAMS.blogUpdates(blogId);
  if (redis) {
    try {
      await redis.del(streamKey);
      console.log(`  Cleared Redis Stream: ${streamKey}\n`);
    } catch {
      // Stream may not exist yet
    }
  } else {
    console.log(`  Skipping Redis Stream clear (SKIP_REDIS=true)\n`);
  }

  // Seed articles — BBTG press releases (into both editorial and delivery)
  const articles = [
    {
      articleId: "a0000001-0001-4000-8000-000000000001",
      title:
        "Building Beyond Technology Group versterkt groeiambitie met IceLake Capital",
      content:
        "Building Beyond Technology Group (BBTG) kondigt een strategische samenwerking aan met investeringsmaatschappij IceLake Capital. Met deze stap versnelt BBTG de gezamenlijke ambitie om cloud-, data- en AI-oplossingen binnen het Microsoft-ecosysteem verder op te schalen en de buy-&-build-strategie te intensiveren.",
      author: "BBTG Redactie",
      publishedAt: "2025-03-14T10:00:00.000Z",
      slug: "bbtg-versterkt-groeiambitie-met-icelake-capital",
    },
    {
      articleId: "a0000001-0002-4000-8000-000000000002",
      title:
        "BBTG en Navara bundelen krachten voor verdere groei in Cloud, Data & AI dienstverlening",
      content:
        "Building Beyond Technology Group (BBTG) kondigt met trots een strategische samenwerking aan met Navara, een vooraanstaand specialist in softwareontwikkeling en data-, & AI-oplossingen voor complexe digitale vraagstukken binnen het Enterprise segment.",
      author: "BBTG Redactie",
      publishedAt: "2025-05-14T09:00:00.000Z",
      slug: "bbtg-en-navara-bundelen-krachten",
    },
    {
      articleId: "a0000001-0003-4000-8000-000000000003",
      title:
        "BBTG groeit uit tot toonaangevende Nederlandse IT-speler met meer dan 2000 experts door strategisch partnership met OGD",
      content:
        "Building Beyond Technology Group (BBTG) verstevigt haar positie in de IT-sector door OGD ict-diensten (OGD) te verwelkomen bij het platform. Met ruim 1.400 medewerkers is OGD een gevestigde naam in de markt als mission-critical IT-dienstverlener voor grotere klanten in Nederland.",
      author: "BBTG Redactie",
      publishedAt: "2025-07-15T08:00:00.000Z",
      slug: "bbtg-groeit-met-ogd-partnership",
    },
    {
      articleId: "a0000001-0004-4000-8000-000000000004",
      title:
        "BBTG versterkt bestuur met Rob Jobben als Chief Transformation & Integration Officer",
      content:
        "Building Beyond Technology Group (BBTG) versterkt het executive team met de benoeming van Rob Jobben tot Chief Transformation & Integration Officer. Deze strategische stap bevestigt BBTG's positie als leidend en sterk groeiend platform voor mission-critical IT-diensten.",
      author: "BBTG Redactie",
      publishedAt: "2025-10-09T10:00:00.000Z",
      slug: "bbtg-versterkt-bestuur-rob-jobben",
    },
    {
      articleId: "a0000001-0005-4000-8000-000000000005",
      title:
        "Energietransitie-specialist Infiniot sluit zich aan bij BBTG en versterkt dominante positie in Kritische Infrastructuur",
      content:
        "Building Beyond Technology Group (BBTG), het technologisch powerhouse achter Navara, Rubicon, OGD en Harvest, kondigt met trots aan dat Infiniot aansluit bij de groep. Infiniot is een toonaangevend Nederlands expertisebureau, gespecialiseerd in software engineering, data engineering, data science en security voor de energietransitie.",
      author: "BBTG Redactie",
      publishedAt: "2025-11-07T09:00:00.000Z",
      slug: "infiniot-sluit-zich-aan-bij-bbtg",
    },
    {
      articleId: "a0000001-0006-4000-8000-000000000006",
      title:
        "Bauhaus ArtITech sluit zich aan bij Building Beyond Technology Group",
      content:
        "Building Beyond Technology Group (BBTG) kondigt met trots aan dat Bauhaus ArtITech zich heeft aangesloten bij de groep. De komst van Bauhaus ArtITech sluit naadloos aan bij de ambitie van BBTG om als end-to-end Nederlands tech-powerhouse verder te groeien.",
      author: "BBTG Redactie",
      publishedAt: "2025-11-26T10:00:00.000Z",
      slug: "bauhaus-artitech-sluit-aan-bij-bbtg",
    },
    {
      articleId: "a0000001-0007-4000-8000-000000000007",
      title:
        "Building Beyond Technology Group benoemt Rob Blasman tot nieuwe CFO",
      content:
        "Building Beyond Technology Group (BBTG) kondigt de aanstelling aan van Rob Blasman als Chief Financial Officer (CFO). Met zijn komst versterkt BBTG haar bestuur om in te zetten op de strategische koers en groei-ambities van de groep.",
      author: "BBTG Redactie",
      publishedAt: "2025-12-01T10:00:00.000Z",
      slug: "bbtg-benoemt-rob-blasman-cfo",
    },
  ];

  for (const article of articles) {
    await putBoth(editorialArticlesTable, deliveryArticlesTable, article);
    console.log(`  📰 Article: ${article.title}`);
  }

  // Seed a live blog — BBTG Kennisfestival 2026 (into both editorial and delivery)
  const blog = {
    blogId,
    title: "Live: Navara Kennisfestival 2026",
    eventName: "Navara Kennisfestival 2026",
    eventDate: "2026-04-15",
    eventLocation: "Zeist",
    status: "active",
    createdAt: "2026-04-15T11:00:00.000Z",
  };

  await putBoth(editorialBlogsTable, deliveryBlogsTable, blog);
  console.log(`  🎪 Blog: ${blog.title}`);

  // Seed Kennisfestival live updates (into both editorial and delivery + Redis Stream)
  const updates = [
    {
      updateId: randomUUID(),
      blogId,
      content:
        "Welkom bij het live verslag van het Navara Kennisfestival 2026! Vandaag komen meer dan 500 experts samen in Zeist voor een dag vol kennis, innovatie en verbinding.",
      author: "BBTG Redactie",
      minute: null,
      type: "milestone",
      postedAt: "2026-04-15T12:30:00.000Z",
    },
    {
      updateId: randomUUID(),
      blogId,
      content:
        "De deuren zijn open! Collega's van Navara, Harvest en Infiniot stromen binnen. De sfeer zit er goed in. ☕",
      author: "BBTG Redactie",
      minute: null,
      type: "social",
      postedAt: "2026-04-15T13:00:00.000Z",
    },
    {
      updateId: randomUUID(),
      blogId,
      content:
        "De CEO opent het Kennisfestival met een inspirerend verhaal over de groei van BBTG en de kracht van samenwerking tussen alle bedrijven in de groep. De event host neemt het stokje over en geeft een overzicht van het programma.",
      author: "BBTG Redactie",
      minute: null,
      type: "keynote",
      postedAt: "2026-04-15T13:30:00.000Z",
    },
    {
      updateId: randomUUID(),
      blogId,
      content:
        "Navara TechTalks begonnen! Het onderwerp: cloud soevereiniteit. Hoe zorgen we ervoor dat onze data en infrastructuur in Europese handen blijven? Een actueel en relevant thema voor al onze klanten.",
      author: "BBTG Redactie",
      minute: null,
      type: "keynote",
      postedAt: "2026-04-15T14:00:00.000Z",
    },
    {
      updateId: randomUUID(),
      blogId,
      content:
        "Sterke discussie tijdens de Q&A van de TechTalks. Veel vragen over de balans tussen innovatie en digitale soevereiniteit. Het publiek is duidelijk betrokken.",
      author: "BBTG Redactie",
      minute: null,
      type: "commentary",
      postedAt: "2026-04-15T14:35:00.000Z",
    },
    {
      updateId: randomUUID(),
      blogId,
      content:
        "Ronde 1 van de kennissessies is gestart! Zes break rooms draaien tegelijk met onderwerpen variërend van AI-gedreven testing tot zero-trust architectuur.",
      author: "BBTG Redactie",
      minute: null,
      type: "session",
      postedAt: "2026-04-15T15:00:00.000Z",
    },
    {
      updateId: randomUUID(),
      blogId,
      content:
        "Volle zalen bij de sessies van Ronde 1. De interactie is hoog — veel hands-on demo's en live coding. Dit is waar BBTG voor staat: kennisdeling op het hoogste niveau.",
      author: "BBTG Redactie",
      minute: null,
      type: "commentary",
      postedAt: "2026-04-15T15:30:00.000Z",
    },
    {
      updateId: randomUUID(),
      blogId,
      content:
        "Ronde 2 is begonnen! Weer zes parallelle sessies. Onder andere een deep dive in event-driven architectuur en een workshop over platform engineering.",
      author: "BBTG Redactie",
      minute: null,
      type: "session",
      postedAt: "2026-04-15T16:00:00.000Z",
    },
    {
      updateId: randomUUID(),
      blogId,
      content:
        "De energie blijft hoog. Collega's wisselen enthousiast van break room. De koffiebar draait op volle toeren. ☕",
      author: "BBTG Redactie",
      minute: null,
      type: "commentary",
      postedAt: "2026-04-15T16:30:00.000Z",
    },
    {
      updateId: randomUUID(),
      blogId,
      content:
        "Ronde 3 — de laatste ronde kennissessies is van start! In één van de zes break rooms wordt nu live gedemonstreerd hoe event-driven delivery mechanisms werken met Server-Sent Events. Meta! 🚀",
      author: "BBTG Redactie",
      minute: null,
      type: "session",
      postedAt: "2026-04-15T17:00:00.000Z",
    },
  ];

  for (const update of updates) {
    await putBoth(editorialUpdatesTable, deliveryUpdatesTable, update);

    // Also XADD to Redis Stream so SSE replay works with seeded data
    if (redis) {
      const payload = JSON.stringify({
        updateId: update.updateId,
        blogId: update.blogId,
        content: update.content,
        author: update.author,
        minute: update.minute,
        type: update.type,
        postedAt: update.postedAt,
      });
      await redis.xadd(streamKey, "*", "payload", payload);
    }

    console.log(`  💬 Update: ${update.content.substring(0, 50)}...`);
  }

  // Seed chat messages (delivery context only — user-generated)
  const now = Date.now();
  const chatMessages = [
    {
      messageId: randomUUID(),
      blogId,
      author: "Lisa",
      content:
        "Spannend! Ben benieuwd naar de TechTalks over cloud soevereiniteit 🇪🇺",
      postedAt: new Date(now - 15 * 60 * 1000).toISOString(),
    },
    {
      messageId: randomUUID(),
      blogId,
      author: "Martijn",
      content:
        "Zit in de break room over event-driven architectuur. Echt goed verhaal!",
      postedAt: new Date(now - 10 * 60 * 1000).toISOString(),
    },
    {
      messageId: randomUUID(),
      blogId,
      author: "Sophie",
      content: "Wie gaat er straks naar de sessie over Server-Sent Events?",
      postedAt: new Date(now - 5 * 60 * 1000).toISOString(),
    },
  ];

  for (const msg of chatMessages) {
    await client.send(
      new PutCommand({ TableName: deliveryChatMessagesTable, Item: msg }),
    );
    console.log(`  💬 Chat: ${msg.author}: ${msg.content.substring(0, 40)}...`);
  }

  console.log("\n✅ Seed data inserted\n");

  if (redis) {
    await redis.quit();
  }
}

seed().catch((err) => {
  console.error("❌ Failed to seed:", err);
  process.exit(1);
});
