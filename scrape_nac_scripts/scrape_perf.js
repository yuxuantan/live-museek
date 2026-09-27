// get list of all locations from main page drop downlist, navigates to each location page, clicking more button until all events are loaded, then scrapes all events
import puppeteer from 'puppeteer';
import { pathToFileURL } from 'node:url';
import { createEventPage, readLocations, readLocationEventsWithRetries, parsePerformances } from './performance_browser.js';
import { createScraperSupabaseClient } from './supabase_client.js';
import { filterCurrentOrFuturePerformances } from './performance_retention.js';

function parseCsvArg(value) {
    return value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
}

function parseCliArgs(argv) {
    const args = {
        limit: null,
        locationIds: new Set(),
        locationNames: [],
        dryRun: false,
        allowPartialWrite: false,
    };

    for (const rawArg of argv) {
        if (rawArg.startsWith('--limit=')) {
            const limitValue = Number.parseInt(rawArg.substring('--limit='.length), 10);
            if (!Number.isNaN(limitValue) && limitValue > 0) {
                args.limit = limitValue;
            }
            continue;
        }

        if (rawArg.startsWith('--location-id=')) {
            const values = parseCsvArg(rawArg.substring('--location-id='.length));
            values.forEach((value) => args.locationIds.add(value));
            continue;
        }

        if (rawArg.startsWith('--location-name=')) {
            const values = parseCsvArg(rawArg.substring('--location-name='.length)).map((value) => value.toLowerCase());
            args.locationNames.push(...values);
            continue;
        }

        if (rawArg === '--dry-run') {
            args.dryRun = true;
            continue;
        }

        if (rawArg === '--allow-partial-write') {
            args.allowPartialWrite = true;
            continue;
        }
    }

    return args;
}

export async function scrapeWebsite({
    argv = process.argv.slice(2),
    supabase = createScraperSupabaseClient(),
    launch = (options) => puppeteer.launch(options),
    browserOptions = {},
} = {}) {
    const cliArgs = parseCliArgs(argv);
    const browser = await launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
        let allLocations;
        const directoryPage = await createEventPage(browser);
        try {
            allLocations = await readLocations(directoryPage, browserOptions);
        } finally {
            await directoryPage.close();
        }
        let targetLocations = allLocations;

        if (cliArgs.locationIds.size > 0) {
            targetLocations = targetLocations.filter((entry) => cliArgs.locationIds.has(entry.location_id));
        }

        if (cliArgs.locationNames.length > 0) {
            targetLocations = targetLocations.filter((entry) =>
                cliArgs.locationNames.some((needle) => entry.location_name.toLowerCase().includes(needle))
            );
        }

        if (cliArgs.limit != null) {
            targetLocations = targetLocations.slice(0, cliArgs.limit);
        }

        const hasFilters = cliArgs.locationIds.size > 0 || cliArgs.locationNames.length > 0 || cliArgs.limit != null;
        const shouldWriteToDb = !cliArgs.dryRun && (!hasFilters || cliArgs.allowPartialWrite);

        console.log(
            `Selected ${targetLocations.length}/${allLocations.length} locations ` +
            `(limit=${cliArgs.limit ?? 'none'}, ids=${cliArgs.locationIds.size}, names=${cliArgs.locationNames.length}, dryRun=${cliArgs.dryRun})`
        );
        if (!shouldWriteToDb) {
            console.log('Subset/dry-run mode active. Database overwrite is disabled for this run.');
        }
        if (hasFilters && cliArgs.allowPartialWrite) {
            console.log('WARNING: --allow-partial-write enabled. This run can overwrite performances with partial data.');
        }
        if (targetLocations.length === 0) {
            console.log('No locations match the current filters. Exiting.');
            throw new Error('No locations match the current filters');
        }


        const performances_list = [];
        for (const [index, location] of targetLocations.entries()) {
            console.log(`Scraping location #${index + 1}/${targetLocations.length}: ${location.location_name}`);
            try {
                const rows = await readLocationEventsWithRetries(browser, location.location_id, browserOptions);
                const performances = parsePerformances(rows, location.location_id);
                performances_list.push(...performances);
                if (performances_list.length > 100_000) throw new Error('Total event limit exceeded');
                console.log(`Parsed ${performances.length} performances from ${location.location_name}; ` +
                    `total=${performances_list.length}, heapMB=${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}`);
            } catch (error) {
                throw new Error(`Incomplete scrape at ${location.location_name}; database refresh aborted`, { cause: error });
            }
        }
        // Every selected location must complete and every event must parse before any write.
        if (performances_list.length === 0) {
            throw new Error('No performances scraped; database refresh aborted');
        }
        if (!shouldWriteToDb) {
            console.log(`Scrape finished with ${performances_list.length} performances. Skipping DB write in subset/dry-run mode.`);
            return { performanceCount: performances_list.length, written: false };
        }
        const refreshCutoff = new Date();
        const refreshCutoffIso = refreshCutoff.toISOString();
        const currentOrFuturePerformances = filterCurrentOrFuturePerformances(
            performances_list,
            refreshCutoff
        );

        // Preserve completed bookings for analytics and replace only current/future rows.
        console.log(`Done scraping all locations. Replacing performances ending on or after ${refreshCutoffIso}`);
        const response = await supabase
            .from('performances')
            .delete()
            .gte('end_datetime', refreshCutoffIso);
        if (response.error != null) {
            throw response.error;
        }
        else {
            console.log('Cleared current and future performances; historical rows were retained');
        }

        if (currentOrFuturePerformances.length > 0) {
            const { error } = await supabase.from('performances').insert(currentOrFuturePerformances)
            if (error == null) {
                console.log(`Done writing ${currentOrFuturePerformances.length} current/future performances to Supabase`);
            }
            else {
                throw error;
            }
        } else {
            console.log('No current or future performances to insert');
        }
        return { performanceCount: currentOrFuturePerformances.length, written: true };
    } finally {
        await browser.close();
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    scrapeWebsite().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}
