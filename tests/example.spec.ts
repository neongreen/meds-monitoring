import { test, expect } from "@playwright/test"
import { alphabetical, unique } from "radash"

const discordWebhook = process.env.DISCORD_WEBHOOK!

test("Medikinet CR 20mg", async ({ page }) => {
  const drugName = "Medikinet CR 20 mg"
  const searchLocation = "Przyokopowa 33"
  const targetPharmacy = "Przyokopowa 33 Lok. B2"

  await page.goto("https://ktomalek.pl/")
  await page.getByRole("button", { name: "Akceptuję i przechodzę do" }).click()
  await page
    .getByPlaceholder("Miasto, ulica")
    .fill(`Warszawa, ${searchLocation}`)
  await page.getByRole("button", { name: "Szukaj adresu" }).click()
  await page.getByPlaceholder("Wpisz nazwę leku").fill(drugName)
  await page.getByRole("button", { name: "Szukaj leku" }).click()
  await page
    .locator(".kontenerWyszukanychLekow", { hasText: drugName })
    .locator("a", { hasText: "Sprawdź dostępność w aptece" })
    .click()

  let pharmacies: string[] = []
  await expect(async () => {
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
      console.log(JSON.stringify(pharmacies))
    }
    expect(pharmacies).toContain(`Warszawa, ${targetPharmacy}`)
  }).toPass()

  // Notify on success
  await fetch(discordWebhook, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      content: `${drugName} is available at ${targetPharmacy}`,
    }),
  })
})
