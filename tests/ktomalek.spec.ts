import { test, expect } from "@playwright/test"
import { alphabetical, unique } from "radash"

const discordWebhook = process.env.DISCORD_WEBHOOK!

test("Medikinet CR 20mg", async ({ page }) => {
  const drugName = "Medikinet CR 20 mg"
  const pharmacy = "Przyokopowa 33"

  await page.goto("https://ktomalek.pl/")
  await page.getByRole("button", { name: "Akceptuję i przechodzę do" }).click()
  await page.getByPlaceholder("Miasto, ulica").fill(`Warszawa, ${pharmacy}`)
  await page.getByRole("button", { name: "Szukaj adresu" }).click()
  await page.getByPlaceholder("Wpisz nazwę leku").fill(drugName)
  await page.getByRole("button", { name: "Szukaj leku" }).click()
  await page
    .locator(".kontenerWyszukanychLekow", { hasText: drugName })
    .locator("a", { hasText: "Sprawdź dostępność w aptece" })
    .click()

  let pharmacies: string[] = []
  // Try to locate the pharmacy on the page at least several times (loading can be slow)
  let found = false
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(1000)
    // Get all pharmacy addresses
    const newPharmacies = alphabetical(
      unique(
        await page
          .locator(".results-item")
          .filter({ hasText: "Wybrane opakowanie jest dostępne" })
          .locator("a", { hasText: "Warszawa," })
          .allTextContents()
      ),
      (x) => x
    )
    // Log pharmacies if we got smth new
    if (JSON.stringify(pharmacies) !== JSON.stringify(newPharmacies)) {
      pharmacies = newPharmacies
      console.log(pharmacies)
    }
    // Check if the pharmacy is in the list
    if (
      pharmacies.some((x) => x.toLowerCase().includes(pharmacy.toLowerCase()))
    ) {
      found = true
      break
    }
  }

  console.log({ found })

  // Notify on success
  if (found) {
    await fetch(discordWebhook, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: `${drugName} is available at ${pharmacy}`,
      }),
    })
  }
})
