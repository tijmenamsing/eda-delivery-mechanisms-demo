import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";

const endpoint = process.env["DYNAMODB_ENDPOINT"];
const region = process.env["AWS_REGION"] ?? "eu-west-1";

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region,
    // Only override endpoint for LocalStack. Omit in production so the SDK
    // resolves the real AWS endpoint and uses the default credential chain.
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

const articlesTable = process.env["ARTICLES_TABLE"] ?? "dev-articles";
const blogsTable = process.env["BLOGS_TABLE"] ?? "dev-blogs";
const updatesTable = process.env["UPDATES_TABLE"] ?? "dev-updates";
const chatMessagesTable =
  process.env["CHAT_MESSAGES_TABLE"] ?? "dev-chat-messages";

const blogId = "b1e5a3f0-1234-4abc-9def-000000000001";

async function seed(): Promise<void> {
  console.log("\n🌱 Seeding demo data...\n");

  // Seed articles — BBTG press releases
  const articles = [
    {
      articleId: "a0000001-0001-4000-8000-000000000001",
      title: "Building Beyond Technology Group versterkt groeiambitie met IceLake Capital",
      content:
        "Building Beyond Technology Group (BBTG) kondigt een strategische samenwerking aan met investeringsmaatschappij IceLake Capital. Met deze stap versnelt BBTG de gezamenlijke ambitie om cloud-, data- en AI-oplossingen binnen het Microsoft-ecosysteem verder op te schalen en de buy-&-build-strategie te intensiveren.",
      author: "BBTG Redactie",
      publishedAt: "2025-03-14T10:00:00.000Z",
      slug: "bbtg-versterkt-groeiambitie-met-icelake-capital",
    },
    {
      articleId: "a0000001-0002-4000-8000-000000000002",
      title: "BBTG en Navara bundelen krachten voor verdere groei in Cloud, Data & AI dienstverlening",
      content:
        "Building Beyond Technology Group (BBTG) kondigt met trots een strategische samenwerking aan met Navara, een vooraanstaand specialist in softwareontwikkeling en data-, & AI-oplossingen voor complexe digitale vraagstukken binnen het Enterprise segment.",
      author: "BBTG Redactie",
      publishedAt: "2025-05-14T09:00:00.000Z",
      slug: "bbtg-en-navara-bundelen-krachten",
    },
    {
      articleId: "a0000001-0003-4000-8000-000000000003",
      title: "BBTG groeit uit tot toonaangevende Nederlandse IT-speler met meer dan 2000 experts door strategisch partnership met OGD",
      content:
        "Building Beyond Technology Group (BBTG) verstevigt haar positie in de IT-sector door OGD ict-diensten (OGD) te verwelkomen bij het platform. Met ruim 1.400 medewerkers is OGD een gevestigde naam in de markt als mission-critical IT-dienstverlener voor grotere klanten in Nederland.",
      author: "BBTG Redactie",
      publishedAt: "2025-07-15T08:00:00.000Z",
      slug: "bbtg-groeit-met-ogd-partnership",
    },
    {
      articleId: "a0000001-0004-4000-8000-000000000004",
      title: "BBTG versterkt bestuur met Rob Jobben als Chief Transformation & Integration Officer",
      content:
        "Building Beyond Technology Group (BBTG) versterkt het executive team met de benoeming van Rob Jobben tot Chief Transformation & Integration Officer. Deze strategische stap bevestigt BBTG's positie als leidend en sterk groeiend platform voor mission-critical IT-diensten.",
      author: "BBTG Redactie",
      publishedAt: "2025-10-09T10:00:00.000Z",
      slug: "bbtg-versterkt-bestuur-rob-jobben",
    },
    {
      articleId: "a0000001-0005-4000-8000-000000000005",
      title: "Energietransitie-specialist Infiniot sluit zich aan bij BBTG en versterkt dominante positie in Kritische Infrastructuur",
      content:
        "Building Beyond Technology Group (BBTG), het technologisch powerhouse achter Navara, Rubicon, OGD en Harvest, kondigt met trots aan dat Infiniot aansluit bij de groep. Infiniot is een toonaangevend Nederlands expertisebureau, gespecialiseerd in software engineering, data engineering, data science en security voor de energietransitie.",
      author: "BBTG Redactie",
      publishedAt: "2025-11-07T09:00:00.000Z",
      slug: "infiniot-sluit-zich-aan-bij-bbtg",
    },
    {
      articleId: "a0000001-0006-4000-8000-000000000006",
      title: "Bauhaus ArtITech sluit zich aan bij Building Beyond Technology Group",
      content:
        "Building Beyond Technology Group (BBTG) kondigt met trots aan dat Bauhaus ArtITech zich heeft aangesloten bij de groep. De komst van Bauhaus ArtITech sluit naadloos aan bij de ambitie van BBTG om als end-to-end Nederlands tech-powerhouse verder te groeien.",
      author: "BBTG Redactie",
      publishedAt: "2025-11-26T10:00:00.000Z",
      slug: "bauhaus-artitech-sluit-aan-bij-bbtg",
    },
    {
      articleId: "a0000001-0007-4000-8000-000000000007",
      title: "Building Beyond Technology Group benoemt Rob Blasman tot nieuwe CFO",
      content:
        "Building Beyond Technology Group (BBTG) kondigt de aanstelling aan van Rob Blasman als Chief Financial Officer (CFO). Met zijn komst versterkt BBTG haar bestuur om in te zetten op de strategische koers en groei-ambities van de groep.",
      author: "BBTG Redactie",
      publishedAt: "2025-12-01T10:00:00.000Z",
      slug: "bbtg-benoemt-rob-blasman-cfo",
    },
  ];

  for (const article of articles) {
    await client.send(
      new PutCommand({ TableName: articlesTable, Item: article }),
    );
    console.log(`  📰 Article: ${article.title}`);
  }

  // Seed a live blog — BBTG Kennisfestival 2026
  const blog = {
    blogId,
    title: "Live: BBTG Kennisfestival 2026",
    eventName: "BBTG Kennisfestival 2026",
    eventDate: "2026-04-15",
    eventLocation: "Leusden",
    status: "active",
    createdAt: "2026-04-15T11:00:00.000Z",
  };

  await client.send(
    new PutCommand({ TableName: blogsTable, Item: blog }),
  );
  console.log(`  🎪 Blog: ${blog.title}`);

  // Seed Kennisfestival live updates (pre-seeded up to 17:00)
  const updates = [
    {
      updateId: randomUUID(),
      blogId,
      content: "Welkom bij het live verslag van het BBTG Kennisfestival 2026! Vandaag komen meer dan 500 experts samen in Leusden voor een dag vol kennis, innovatie en verbinding.",
      author: "BBTG Redactie",
      minute: null,
      type: "milestone",
      postedAt: "2026-04-15T12:30:00.000Z",
    },
    {
      updateId: randomUUID(),
      blogId,
      content: "De deuren zijn open! Collega's van Navara, Rubicon, OGD, Harvest, Infiniot en Bauhaus ArtITech stromen binnen. De sfeer zit er goed in. ☕",
      author: "BBTG Redactie",
      minute: null,
      type: "social",
      postedAt: "2026-04-15T13:00:00.000Z",
    },
    {
      updateId: randomUUID(),
      blogId,
      content: "De CEO opent het Kennisfestival met een inspirerend verhaal over de groei van BBTG en de kracht van samenwerking tussen alle bedrijven in de groep. De event host neemt het stokje over en geeft een overzicht van het programma.",
      author: "BBTG Redactie",
      minute: null,
      type: "keynote",
      postedAt: "2026-04-15T13:30:00.000Z",
    },
    {
      updateId: randomUUID(),
      blogId,
      content: "Navara TechTalks begonnen! Het onderwerp: cloud soevereiniteit. Hoe zorgen we ervoor dat onze data en infrastructuur in Europese handen blijven? Een actueel en relevant thema voor al onze klanten.",
      author: "BBTG Redactie",
      minute: null,
      type: "keynote",
      postedAt: "2026-04-15T14:00:00.000Z",
    },
    {
      updateId: randomUUID(),
      blogId,
      content: "Sterke discussie tijdens de Q&A van de TechTalks. Veel vragen over de balans tussen innovatie en digitale soevereiniteit. Het publiek is duidelijk betrokken.",
      author: "BBTG Redactie",
      minute: null,
      type: "commentary",
      postedAt: "2026-04-15T14:35:00.000Z",
    },
    {
      updateId: randomUUID(),
      blogId,
      content: "Ronde 1 van de kennissessies is gestart! Zes break rooms draaien tegelijk met onderwerpen variërend van AI-gedreven testing tot zero-trust architectuur.",
      author: "BBTG Redactie",
      minute: null,
      type: "session",
      postedAt: "2026-04-15T15:00:00.000Z",
    },
    {
      updateId: randomUUID(),
      blogId,
      content: "Volle zalen bij de sessies van Ronde 1. De interactie is hoog — veel hands-on demo's en live coding. Dit is waar BBTG voor staat: kennisdeling op het hoogste niveau.",
      author: "BBTG Redactie",
      minute: null,
      type: "commentary",
      postedAt: "2026-04-15T15:30:00.000Z",
    },
    {
      updateId: randomUUID(),
      blogId,
      content: "Ronde 2 is begonnen! Weer zes parallelle sessies. Onder andere een deep dive in event-driven architectuur en een workshop over platform engineering.",
      author: "BBTG Redactie",
      minute: null,
      type: "session",
      postedAt: "2026-04-15T16:00:00.000Z",
    },
    {
      updateId: randomUUID(),
      blogId,
      content: "De energie blijft hoog. Collega's wisselen enthousiast van break room. De koffiebar draait op volle toeren. ☕",
      author: "BBTG Redactie",
      minute: null,
      type: "commentary",
      postedAt: "2026-04-15T16:30:00.000Z",
    },
    {
      updateId: randomUUID(),
      blogId,
      content: "Ronde 3 — de laatste ronde kennissessies is van start! In één van de zes break rooms wordt nu live gedemonstreerd hoe event-driven delivery mechanisms werken met Server-Sent Events. Meta! 🚀",
      author: "BBTG Redactie",
      minute: null,
      type: "session",
      postedAt: "2026-04-15T17:00:00.000Z",
    },
  ];

  for (const update of updates) {
    await client.send(
      new PutCommand({ TableName: updatesTable, Item: update }),
    );
    console.log(`  💬 Update: ${update.content.substring(0, 50)}...`);
  }

  // Seed chat messages
  const chatMessages = [
    {
      messageId: randomUUID(),
      blogId,
      author: "Lisa",
      content: "Spannend! Ben benieuwd naar de TechTalks over cloud soevereiniteit 🇪🇺",
      postedAt: "2026-04-15T13:35:00.000Z",
    },
    {
      messageId: randomUUID(),
      blogId,
      author: "Martijn",
      content: "Zit in de break room over event-driven architectuur. Echt goed verhaal!",
      postedAt: "2026-04-15T16:10:00.000Z",
    },
    {
      messageId: randomUUID(),
      blogId,
      author: "Sophie",
      content: "Wie gaat er straks naar de sessie over Server-Sent Events?",
      postedAt: "2026-04-15T16:45:00.000Z",
    },
  ];

  for (const msg of chatMessages) {
    await client.send(
      new PutCommand({ TableName: chatMessagesTable, Item: msg }),
    );
    console.log(`  💬 Chat: ${msg.author}: ${msg.content.substring(0, 40)}...`);
  }

  console.log("\n✅ Seed data inserted\n");
}

seed().catch((err) => {
  console.error("❌ Failed to seed:", err);
  process.exit(1);
});
