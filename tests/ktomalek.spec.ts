import { test, expect } from "@playwright/test"
import { alphabetical, unique } from "radash"

const discordWebhook = process.env.DISCORD_WEBHOOK!

type Monitor = {
  // Thing to enter in the search box
  searchQuery: string
  // Full name of the drug. Example: "Medikinet 20 mg"
  drug: string
  // Pharmacy address in Warsaw
  pharmacy: string
}

const monitors: Monitor[] = [
  {
    searchQuery: "Medikinet CR 20 mg",
    drug: "Medikinet CR 20 mg",
    pharmacy: "Przyokopowa 33",
  },
  {
    searchQuery: "Medikinet 20 mg",
    drug: "Medikinet 20 mg",
    pharmacy: "Światowida 47",
  },
]

for (const monitor of monitors) {
  const testName = `${monitor.drug} at ${monitor.pharmacy}`
  test(testName, async ({ page }) => {
    await page.goto("https://ktomalek.pl/")
    await page
      .getByRole("button", { name: "Akceptuję i przechodzę do" })
      .click()

    // No idea why, but on CI this fails sometimes so we add delays
    await page.waitForTimeout(1000)
    await page
      .getByPlaceholder("Miasto, ulica")
      .fill(`Warszawa, ${monitor.pharmacy}`)
    await page.getByRole("button", { name: "Szukaj adresu" }).click()

    await page.waitForTimeout(1000)
    await page.getByPlaceholder("Wpisz nazwę leku").fill(monitor.searchQuery)

    await page
      .getByText("Wybierz poszukiwane opakowanie z listy poniżej")
      .first()
      .waitFor()

    // Expand all headings if there are several drug brands
    const unexpandedSection = page
      .locator("#lekiWyniki")
      .getByLabel(/Rozwiń listę leków/)
      .first()
    while (await unexpandedSection.isVisible()) {
      await unexpandedSection.click()
    }

    await page
      .locator(".kontenerWyszukanychLekow", { hasText: monitor.drug })
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
            .locator("#rodzajeAptek .results-item a", { hasText: "Warszawa," })
            .allTextContents()
        ),
        (x) => x
      )
      // Log pharmacies if we got smth new
      if (JSON.stringify(pharmacies) !== JSON.stringify(newPharmacies)) {
        pharmacies = newPharmacies
        console.log(`${testName}: found in pharmacies:`, pharmacies)
      }
      // Check if the pharmacy is on the list
      if (
        pharmacies.some((x) =>
          x.toLowerCase().includes(monitor.pharmacy.toLowerCase())
        )
      ) {
        found = true
        break
      }
    }

    if (pharmacies.length === 0) {
      throw new Error(
        `${testName}: no pharmacies found at all; something is wrong?`
      )
    }

    // Notify on success
    if (found) {
      console.log(`${testName}: pharmacy is on the list, notifying in Discord`)
      await fetch(discordWebhook, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: `${monitor.drug} is available at ${monitor.pharmacy}`,
        }),
      })
    } else {
      console.log(`${testName}: pharmacy is not on the list`)
    }
  })
}
