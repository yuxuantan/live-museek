// TODO: only scrape buskers in performances table that doesnt exist in the buskers table
import { createClient } from '@supabase/supabase-js';
import cheerio from 'cheerio';
import puppeteer from 'puppeteer';

async function scrapeWebsite() {
    // connect to db
    const supabase = createClient('https://mlbwzkspmgxhudfnsfeb.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1sYnd6a3NwbWd4aHVkZm5zZmViIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTY1NzA5NDIsImV4cCI6MjAzMjE0Njk0Mn0.j-2nIAYjiFGMPfaaVAm18SfZxUbY4g57kjbo_RjaBYg')
    const { data, error } = await supabase.from('performances').select();
    let busker_list = [];

    if (error) {
        console.log("Error fetching performances");
    } else {
        console.log("Fetching success");
    }

    // get count data
    console.log("num performances: " + data.length);

    // get unique busker_ids from the performances table
    let busker_ids = [];
    data.forEach(performance => {
        busker_ids.push(performance.busker_id);
    });
    busker_ids = [...new Set(busker_ids)];

    // fetch distinct busker ids from buskers table and remove them from busker_ids which will be used for scraping
    const { data: buskers_data, error: buskers_error } = await supabase.from('buskers').select('busker_id');
    if (buskers_error) {
        console.log("Error fetching buskers");
    }
    const buskers = buskers_data.map(busker => busker.busker_id);
    busker_ids = busker_ids.filter(busker_id => !buskers.includes(busker_id));
    

    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    for (const busker_id of busker_ids) {
        console.log(busker_id);
        const busker_url = `https://eservices.nac.gov.sg/Busking/busker/profile/${busker_id}`;
        await page.goto(busker_url, { timeout: 60000 });
        const html = await page.content();
        const $ = cheerio.load(html);

        // get busker details
        const div_header = $('#div-header');
        const busker_name = div_header.find('h2').text().trim();
        const busker_act = div_header.find('span').text().trim();
        const busker_art_form = $('.card-details-bg').find('ul').find('li').eq(2).text().replace('Art Form: ', '').trim();
        const busker_bio = div_header.find('p').text();
        const busker_socials = div_header.find('li').find('a').map((index, element) => $(element).attr('href')).get().join(', ');
        const busker_image_url = $('#profileImage').attr('src');
        const busker = {
            "busker_id": busker_id,
            "name": busker_name,
            "act": busker_act,
            "art_form": busker_art_form,
            "bio": busker_bio,
            "image_url": busker_image_url,
            "socials": busker_socials,
            "updated_at": new Date()
        };
        console.log(busker);

        // Download image using Puppeteer
        const image_url_full = `https://eservices.nac.gov.sg${busker_image_url}`;
        const response = await page.goto(image_url_full, { timeout: 60000 });
        const image_data = await response.buffer();

        // Upload image to Supabase storage
        const image_upload_response = await supabase.storage.from('busker_images').upload(`busker_images/${busker_id}.jpg`, image_data, { contentType: 'image/jpg' });

        if (image_upload_response.error != null) {
            console.log("Error uploading image");
            console.log(image_upload_response);
        }
        busker_list.push(busker);
    }

    await browser.close();

    // Insert all buskers in buskers_list into buskers table
    const response2 = await supabase.from('buskers').upsert(busker_list, { onConflict: 'busker_id' });
    if (response2.error != null) {
        console.log("Error inserting buskers");
        console.log(response2);
    } else {
        console.log("Buskers upserted successfully");
    }
}

scrapeWebsite();
