// Helper function to merge back-to-back performances at the same location
const mergeBackToBackPerformances = (performances) => {
    // deduplicate performances
    performances = performances.filter((v,i,a)=>a.findIndex(t=>(t.start_datetime === v.start_datetime && t.location_id === v.location_id))===i);
    // Sort performances by start time
    console.log("perf", performances)
    performances.sort((a, b) => {
      if (a.location_id === b.location_id) {
        return new Date(a.start_datetime) - new Date(b.start_datetime);
      }
      return a.location_id - b.location_id;
    });
    const merged = [];
    let prev = null;

    performances.forEach(performance => {
      if (!prev) {
        prev = performance;
      } else {
        // const prevEndTime = new Date(prev.end_datetime);
        // const currStartTime = new Date(performance.start_datetime);

        // Check if the current performance starts immediately after the previous one and at the same location
        if (prev.busker_id === performance.busker_id && prev.location_id === performance.location_id && prev.end_datetime === performance.start_datetime) {
          // Merge performances by extending the end time
          prev.end_datetime = performance.end_datetime;
        } else {
          // Push the previous performance to the merged list and start a new one
          merged.push(prev);
          prev = performance;
        }
      }
    });

    if (prev) merged.push(prev); // Add the last performance
    return merged;
  };

  export { mergeBackToBackPerformances };