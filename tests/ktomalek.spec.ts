import { test, expect } from "@playwright/test"
import { alphabetical, unique } from "radash"

const discordWebhook = process.env.DISCORD_WEBHOOK!

type Monitor = {
  // Thing to enter in the search box
  searchQuery: string
  // Full name of the drug. Example: "Medikinet"
  drug: string
  // Dosage of the drug. Example: "20 mg"
  dosage: string
  // Start location
  locationQuery: string
  // Pharmacy address in Warsaw.
  pharmacyFilter: (x: string) => boolean
}

const monitors: Monitor[] = [
  {
    searchQuery: "Elvanse 70 mg",
    drug: "Elvanse",
    dosage: "70 mg",
    // List of towns: Warszawa and nearby towns (up to ~1h by train)
    // Examples: Warszawa, Pruszków, Piaseczno, Legionowo, Otwock, Grodzisk Mazowiecki, Mińsk Mazowiecki, Nowy Dwór Mazowiecki, Wołomin, Piastów, Sulejówek, Marki, Ząbki, Józefów, Milanówek, Brwinów, Łomianki, Konstancin-Jeziorna, Piaseczno, etc.
    locationQuery: "Warszawa",
    pharmacyFilter: (x) => {
      const warsawNearby = [
        "Warszawa",
        "Pruszków",
        "Piaseczno",
        "Legionowo",
        "Otwock",
        "Grodzisk Mazowiecki",
        "Mińsk Mazowiecki",
        "Nowy Dwór Mazowiecki",
      ]
      return warsawNearby.some((y) => x.includes(y))
    },
  },
]

for (const monitor of monitors) {
  const testName = `${monitor.drug} ${monitor.dosage} at ${monitor.locationQuery}`
  test(testName, async ({ page }) => {
    await page.goto("https://ktomalek.pl/")
    await page
      .getByRole("button", { name: "Akceptuję i przechodzę do" })
      .click()

    // No idea why, but on CI this fails sometimes so we add delays
    await page.waitForTimeout(1000)
    await page.getByPlaceholder("Miasto, ulica").fill(monitor.locationQuery)
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
      .locator(".kontenerWyszukanychLekow")
      .filter({ hasText: monitor.drug })
      .filter({ hasText: monitor.dosage })
      .locator("a", { hasText: "Sprawdź dostępność w aptece" })
      .click()

    let pharmacies: string[] = []
    let filteredPharmacies: string[] = []
    // Try to locate the pharmacy on the page at least several times (loading can be slow)
    let found = false
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(1000)
      // Get all pharmacy addresses
      const newPharmacies = alphabetical(
        unique(
          await page
            .locator("#rodzajeAptek .results-item:visible")
            .locator(
              page
                .locator('[onclick*="pokazAptekeNaMapie"], .icon-location ~ a')
                .or(page.locator("a", { hasText: "Warszawa," }))
            )
            .allTextContents()
        ),
        (x) => x
      )
      // Log pharmacies if we got smth new
      if (JSON.stringify(pharmacies) !== JSON.stringify(newPharmacies)) {
        pharmacies = newPharmacies
        console.log(`${testName}: found in pharmacies:`, pharmacies)
      }
      // Check if there are any pharmacies that match the filter
      filteredPharmacies = pharmacies.filter(monitor.pharmacyFilter)
      console.log(`${testName}: filtered:`, filteredPharmacies)
      if (filteredPharmacies.length > 0) {
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
      console.log(`${testName}: pharmacies found, notifying in Discord`)
      await postToDiscord(
        `${monitor.drug} ${
          monitor.dosage
        } is available at ${filteredPharmacies.join(", ")}`
      )
    } else {
      console.log(`${testName}: no pharmacies found`)
    }
  })
}

async function postToDiscord(message: string) {
  await fetch(discordWebhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: message }),
  })
}
