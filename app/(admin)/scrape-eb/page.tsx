// 'use client'
// import React from 'react';

// const Page: React.FC = () => {
//     const handleScrapeData = async () => {
//         try {
//             const response = await fetch('/api/scrape-eventbrite');
//             const data = await response.json();
//             // Process the scraped data here
//             console.log(data);
//         } catch (error) {
//             console.error('Error scraping data:', error);
//         }
//     };

//     return (
//         <div>
//             {/* Create button to scrape data */}
//             <button className="secondary-btn" onClick={handleScrapeData}>
//                 Scrape Eventbrite Data
//             </button>
//         </div>
//     );
// };

// export default Page;