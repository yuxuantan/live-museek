const axios = require('axios');
const cheerio = require('cheerio');

async function scrapeWebsite() {
    try {
        const response = await axios.get('https://eservices.nac.gov.sg/Busking/');
        const $ = cheerio.load(response.data);

        // get element with id 'location'
        const location = $('#Location')

        // get all the option elements inside location element
        const options = location.find('option')


        // print text of each option element
        options.each(async (index, element) => {
            let location_name = $(element).text()
            let location_id = $(element).val()
            if (location_id == "00000000-0000-0000-0000-000000000000") {
                return;
            }
            const location_url = `https://eservices.nac.gov.sg/Busking/locations/${location_id}/events`


            const location_response = await axios.get(location_url);

            // get element with id 'div-booking-result-view'
            const location_page = cheerio.load(location_response.data)

            const events = location_page('#div-booking-result-view')
            // each event is a div with class 'col-md-6 col-lg-2 col-cuttor'
            // get all divs with class 'col-md-6 col-lg-2 col-cuttor'
            const event_divs = events.find('.col-md-6.col-lg-2.col-cuttor')

            // get h3 text inside as the performer name 
            event_divs.each((index, element) => {
                const performer = $(element).find('h3').text().trim()
                console.log("Location:" + location_name)
                console.log('Performer:' + performer)
                // get all text inside ul class 'dash-bx-times'
                const event_times = $(element).find('.dash-bx-times')
                // first one is date, second one is time. combine the 2 to get the full date and time of the event
                event_times.each((index, element2) => {
                    console.log('Date:' + $(element2).children().first().text().trim())
                    console.log('Time:' + $(element2).children().eq(1).text().trim())
                })
                console.log("=====================================")

            })
        });
    } catch (error) {
        console.error('Error:', error);
    }
}

scrapeWebsite();