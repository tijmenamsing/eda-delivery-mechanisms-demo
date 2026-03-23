import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";

const endpoint = process.env["DYNAMODB_ENDPOINT"] ?? "http://localhost:4566";
const region = process.env["AWS_REGION"] ?? "eu-west-1";

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region,
    endpoint,
    credentials: {
      accessKeyId: process.env["AWS_ACCESS_KEY_ID"] ?? "test",
      secretAccessKey: process.env["AWS_SECRET_ACCESS_KEY"] ?? "test",
    },
  }),
  { marshallOptions: { removeUndefinedValues: true } },
);

const articlesTable = process.env["ARTICLES_TABLE"] ?? "dev-articles";
const blogsTable = process.env["BLOGS_TABLE"] ?? "dev-blogs";
const updatesTable = process.env["UPDATES_TABLE"] ?? "dev-updates";

const blogId = "b1e5a3f0-1234-4abc-9def-000000000001";

async function seed(): Promise<void> {
  console.log("\n🌱 Seeding demo data...\n");

  // Seed articles
  const articles = [
    {
      articleId: randomUUID(),
      title: "Ajax versterkt selectie met nieuw talent",
      content:
        "Ajax heeft vandaag de komst van een veelbelovend talent aangekondigd. De 19-jarige aanvaller tekent een contract voor vier seizoenen en sluit per direct aan bij de A-selectie. Trainer verwacht dat hij direct inzetbaar is voor de komende wedstrijd tegen PSV.",
      author: "Jan de Vries",
      publishedAt: new Date(Date.now() - 3600_000 * 2).toISOString(),
      slug: "ajax-versterkt-selectie-met-nieuw-talent",
    },
    {
      articleId: randomUUID(),
      title: "PSV start voorbereiding op topper tegen Ajax",
      content:
        "PSV is begonnen met de voorbereiding op de belangrijke uitwedstrijd tegen Ajax. De trainer benadrukt dat de ploeg in topvorm is en vol vertrouwen naar Amsterdam afreist. Alle spelers zijn fit en beschikbaar voor selectie.",
      author: "Maria Jansen",
      publishedAt: new Date(Date.now() - 3600_000).toISOString(),
      slug: "psv-start-voorbereiding-op-topper-tegen-ajax",
    },
    {
      articleId: randomUUID(),
      title: "Eredivisie: Stand na speelronde 28",
      content:
        "Na speelronde 28 in de Eredivisie is de titelstrijd spannender dan ooit. Ajax en PSV staan gelijk op punten, met Feyenoord op slechts twee punten achterstand. De topper van aanstaand weekend kan beslissend zijn voor het kampioenschap.",
      author: "Pieter Bakker",
      publishedAt: new Date(Date.now() - 1800_000).toISOString(),
      slug: "eredivisie-stand-na-speelronde-28",
    },
  ];

  for (const article of articles) {
    await client.send(
      new PutCommand({ TableName: articlesTable, Item: article }),
    );
    console.log(`  📰 Article: ${article.title}`);
  }

  // Seed a live blog
  const blog = {
    blogId,
    title: "Live: Ajax - PSV | Eredivisie",
    matchHomeTeam: "Ajax",
    matchAwayTeam: "PSV",
    matchDate: new Date().toISOString().split("T")[0],
    status: "active",
    createdAt: new Date(Date.now() - 7200_000).toISOString(),
  };

  await client.send(
    new PutCommand({ TableName: blogsTable, Item: blog }),
  );
  console.log(`  ⚽ Blog: ${blog.title}`);

  // Seed some initial updates
  const updates = [
    {
      updateId: randomUUID(),
      blogId,
      content: "Welkom bij de live verslaggeving van Ajax - PSV! De spanning is voelbaar in de Johan Cruijff ArenA.",
      author: "Jan de Vries",
      minute: null,
      type: "commentary",
      postedAt: new Date(Date.now() - 3600_000).toISOString(),
    },
    {
      updateId: randomUUID(),
      blogId,
      content: "De opstellingen zijn bekend. Ajax start met de verwachte elf, PSV kiest voor een verrassende spits.",
      author: "Jan de Vries",
      minute: null,
      type: "commentary",
      postedAt: new Date(Date.now() - 1800_000).toISOString(),
    },
    {
      updateId: randomUUID(),
      blogId,
      content: "De aftrap! Ajax trapt af in de ArenA.",
      author: "Jan de Vries",
      minute: 1,
      type: "commentary",
      postedAt: new Date(Date.now() - 900_000).toISOString(),
    },
  ];

  for (const update of updates) {
    await client.send(
      new PutCommand({ TableName: updatesTable, Item: update }),
    );
    console.log(`  💬 Update: ${update.content.substring(0, 50)}...`);
  }

  console.log("\n✅ Seed data inserted\n");
}

seed().catch((err) => {
  console.error("❌ Failed to seed:", err);
  process.exit(1);
});
