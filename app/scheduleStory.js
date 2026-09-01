export const INSTAGRAM_STORY_WIDTH = 1080;
export const INSTAGRAM_STORY_HEIGHT = 1920;
export const MAX_SCHEDULE_RANGE_DAYS = 7;

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function toScheduleDateKey(value) {
  if (typeof value === 'string') {
    const match = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) return match[1];
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseScheduleDateKey(dateKey) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey ?? ''))) return null;

  const [year, month, day] = dateKey.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

export function addDaysToScheduleDate(dateKey, days) {
  const date = parseScheduleDateKey(dateKey);
  if (!date) return '';
  date.setDate(date.getDate() + days);
  return toScheduleDateKey(date);
}

export function getNextWeekScheduleRange(now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const daysUntilNextMonday = ((8 - start.getDay()) % 7) || 7;
  start.setDate(start.getDate() + daysUntilNextMonday);

  return {
    fromDate: toScheduleDateKey(start),
    toDate: addDaysToScheduleDate(toScheduleDateKey(start), 6),
  };
}

export function validateScheduleRange(fromDate, toDate) {
  const from = parseScheduleDateKey(fromDate);
  const to = parseScheduleDateKey(toDate);

  if (!from || !to) {
    return { valid: false, message: 'Choose both a from date and a to date.' };
  }

  if (to < from) {
    return { valid: false, message: 'The to date must be on or after the from date.' };
  }

  const dayCount = Math.round((to.getTime() - from.getTime()) / DAY_IN_MS) + 1;
  if (dayCount > MAX_SCHEDULE_RANGE_DAYS) {
    return {
      valid: false,
      message: `Choose up to ${MAX_SCHEDULE_RANGE_DAYS} days so the story stays easy to read.`,
    };
  }

  return { valid: true, dayCount, message: '' };
}

function timeInMinutes(value) {
  const match = String(value ?? '').match(/T(\d{2}):(\d{2})/);
  if (!match) return Number.MAX_SAFE_INTEGER;
  return (Number(match[1]) * 60) + Number(match[2]);
}

export function selectSchedulePerformances(performances, fromDate, toDate) {
  return (performances ?? [])
    .filter((performance) => {
      const dateKey = toScheduleDateKey(performance.start_datetime);
      return dateKey >= fromDate && dateKey <= toDate;
    })
    .sort((a, b) => {
      const dateDifference = toScheduleDateKey(a.start_datetime)
        .localeCompare(toScheduleDateKey(b.start_datetime));
      if (dateDifference !== 0) return dateDifference;
      return timeInMinutes(a.start_datetime) - timeInMinutes(b.start_datetime);
    });
}

export function groupSchedulePerformances(performances) {
  const groups = [];

  for (const performance of performances ?? []) {
    const dateKey = toScheduleDateKey(performance.start_datetime);
    let group = groups[groups.length - 1];
    if (!group || group.dateKey !== dateKey) {
      group = { dateKey, performances: [] };
      groups.push(group);
    }
    group.performances.push(performance);
  }

  return groups;
}

function formatClock(value) {
  const match = String(value ?? '').match(/T(\d{2}):(\d{2})/);
  if (!match) return 'TBC';

  const hour = Number(match[1]);
  const minute = match[2];
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  return { label: minute === '00' ? String(displayHour) : `${displayHour}:${minute}`, suffix };
}

export function formatScheduleTimeRange(start, end) {
  const startTime = formatClock(start);
  const endTime = formatClock(end);
  if (typeof startTime === 'string' || typeof endTime === 'string') return 'Time TBC';

  if (startTime.suffix === endTime.suffix) {
    return `${startTime.label}–${endTime.label} ${endTime.suffix}`;
  }
  return `${startTime.label} ${startTime.suffix}–${endTime.label} ${endTime.suffix}`;
}

function roundedRect(context, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + safeRadius, y);
  context.lineTo(x + width - safeRadius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
  context.lineTo(x + width, y + height - safeRadius);
  context.quadraticCurveTo(x + width, y + height, x + width - safeRadius, y + height);
  context.lineTo(x + safeRadius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
  context.lineTo(x, y + safeRadius);
  context.quadraticCurveTo(x, y, x + safeRadius, y);
  context.closePath();
}

function fitText(context, text, maxWidth) {
  const normalized = String(text ?? '').trim();
  if (context.measureText(normalized).width <= maxWidth) return normalized;

  let fitted = normalized;
  while (fitted.length > 1 && context.measureText(`${fitted}…`).width > maxWidth) {
    fitted = fitted.slice(0, -1);
  }
  return `${fitted.trimEnd()}…`;
}

function drawDecorations(context) {
  context.save();
  context.globalAlpha = 0.22;
  context.fillStyle = '#f824ae';
  context.beginPath();
  context.arc(1020, 90, 240, 0, Math.PI * 2);
  context.fill();

  context.globalAlpha = 0.16;
  context.fillStyle = '#8b5cf6';
  context.beginPath();
  context.arc(25, 1610, 300, 0, Math.PI * 2);
  context.fill();

  context.globalAlpha = 0.1;
  context.strokeStyle = '#ffffff';
  context.lineWidth = 2;
  for (let index = 0; index < 8; index += 1) {
    context.beginPath();
    context.arc(960, 1510, 80 + (index * 28), 0, Math.PI * 2);
    context.stroke();
  }
  context.restore();
}

function initialsFor(name) {
  return String(name ?? 'LM')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'LM';
}

function drawProfile(context, image, buskerName) {
  const centerX = 882;
  const centerY = 237;
  const radius = 126;

  context.save();
  context.beginPath();
  context.arc(centerX, centerY, radius + 10, 0, Math.PI * 2);
  context.fillStyle = 'rgba(255, 255, 255, 0.16)';
  context.fill();

  context.beginPath();
  context.arc(centerX, centerY, radius, 0, Math.PI * 2);
  context.clip();

  if (image) {
    const scale = Math.max((radius * 2) / image.width, (radius * 2) / image.height);
    const width = image.width * scale;
    const height = image.height * scale;
    context.drawImage(image, centerX - (width / 2), centerY - (height / 2), width, height);
  } else {
    const gradient = context.createLinearGradient(
      centerX - radius,
      centerY - radius,
      centerX + radius,
      centerY + radius
    );
    gradient.addColorStop(0, '#f824ae');
    gradient.addColorStop(1, '#8b5cf6');
    context.fillStyle = gradient;
    context.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);
    context.fillStyle = '#ffffff';
    context.font = '800 76px Inter, Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(initialsFor(buskerName), centerX, centerY + 3);
  }
  context.restore();
}

function formatRange(fromDate, toDate) {
  const from = parseScheduleDateKey(fromDate);
  const to = parseScheduleDateKey(toDate);
  const sameYear = from.getFullYear() === to.getFullYear();
  const fromLabel = from.toLocaleDateString('en-SG', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
  const toLabel = to.toLocaleDateString('en-SG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return `${fromLabel} — ${toLabel}`;
}

function formatDay(dateKey) {
  const date = parseScheduleDateKey(dateKey);
  return {
    weekday: date.toLocaleDateString('en-SG', { weekday: 'long' }).toUpperCase(),
    date: date.toLocaleDateString('en-SG', { day: '2-digit', month: 'short' }).toUpperCase(),
  };
}

function partitionDayGroups(dayGroups, columnCount) {
  if (columnCount === 1) return [dayGroups];

  const weight = (group) => 120 + (group.performances.length * 92);
  let bestIndex = 1;
  let bestDifference = Number.POSITIVE_INFINITY;

  for (let index = 1; index < dayGroups.length; index += 1) {
    const left = dayGroups.slice(0, index).reduce((sum, group) => sum + weight(group), 0);
    const right = dayGroups.slice(index).reduce((sum, group) => sum + weight(group), 0);
    const difference = Math.abs(left - right);
    if (difference < bestDifference) {
      bestDifference = difference;
      bestIndex = index;
    }
  }

  return [dayGroups.slice(0, bestIndex), dayGroups.slice(bestIndex)];
}

function drawDayCard(context, group, x, y, width, height, compact) {
  roundedRect(context, x, y, width, height, 30);
  context.fillStyle = 'rgba(255, 255, 255, 0.09)';
  context.fill();
  context.strokeStyle = 'rgba(255, 255, 255, 0.16)';
  context.lineWidth = 2;
  context.stroke();

  const day = formatDay(group.dateKey);
  context.textBaseline = 'alphabetic';
  context.textAlign = 'left';
  context.fillStyle = '#f9a8d4';
  context.font = `800 ${compact ? 25 : 27}px Inter, Arial, sans-serif`;
  context.fillText(day.weekday, x + 28, y + 47);

  context.textAlign = 'right';
  context.fillStyle = 'rgba(255, 255, 255, 0.68)';
  context.font = `700 ${compact ? 23 : 25}px Inter, Arial, sans-serif`;
  context.fillText(day.date, x + width - 28, y + 47);

  const eventsTop = y + 74;
  const eventHeight = (height - 90) / group.performances.length;
  const locationX = compact ? x + 173 : x + 205;
  const timeWidth = compact ? 127 : 156;
  const locationWidth = (x + width - 28) - locationX;

  group.performances.forEach((performance, index) => {
    const eventY = eventsTop + (eventHeight * index);
    if (index > 0) {
      context.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(x + 28, eventY - 10);
      context.lineTo(x + width - 28, eventY - 10);
      context.stroke();
    }

    const timeLabel = formatScheduleTimeRange(
      performance.start_datetime,
      performance.end_datetime
    );
    roundedRect(context, x + 28, eventY, timeWidth, 46, 23);
    context.fillStyle = 'rgba(248, 36, 174, 0.22)';
    context.fill();
    context.fillStyle = '#ffffff';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `800 ${compact ? 19 : 22}px Inter, Arial, sans-serif`;
    context.fillText(fitText(context, timeLabel, timeWidth - 20), x + 28 + (timeWidth / 2), eventY + 23);

    context.fillStyle = '#ffffff';
    context.textAlign = 'left';
    context.font = `700 ${compact ? 25 : 28}px Inter, Arial, sans-serif`;
    context.fillText(
      fitText(context, performance.location_name || 'Location to be announced', locationWidth),
      locationX,
      eventY + 29
    );
  });
}

function drawSchedule(context, dayGroups) {
  const scheduleTop = 548;
  const scheduleBottom = 1658;
  const availableHeight = scheduleBottom - scheduleTop;
  const gap = 22;
  const totalEvents = dayGroups.reduce((sum, group) => sum + group.performances.length, 0);
  const columnCount = dayGroups.length > 4 || totalEvents > 9 ? 2 : 1;
  const columns = partitionDayGroups(dayGroups, columnCount);
  const columnGap = 24;
  const columnWidth = columnCount === 1 ? 936 : 456;

  columns.forEach((groups, columnIndex) => {
    const naturalHeights = groups.map((group) => 120 + (group.performances.length * 92));
    const naturalTotal = naturalHeights.reduce((sum, height) => sum + height, 0) +
      (Math.max(0, groups.length - 1) * gap);
    const scale = Math.min(1, availableHeight / naturalTotal);
    let y = scheduleTop;

    groups.forEach((group, groupIndex) => {
      const height = naturalHeights[groupIndex] * scale;
      const x = 72 + (columnIndex * (columnWidth + columnGap));
      drawDayCard(context, group, x, y, columnWidth, height, columnCount === 2 || scale < 0.82);
      y += height + gap;
    });
  });
}

async function loadImageFromUrls(imageUrls, fetchImpl) {
  for (const imageUrl of imageUrls ?? []) {
    if (!imageUrl) continue;
    let objectUrl = '';
    try {
      const response = await fetchImpl(imageUrl, { cache: 'no-store', mode: 'cors' });
      if (!response.ok) continue;
      objectUrl = URL.createObjectURL(await response.blob());
      const image = await new Promise((resolve, reject) => {
        const nextImage = new Image();
        nextImage.onload = () => resolve(nextImage);
        nextImage.onerror = reject;
        nextImage.src = objectUrl;
      });
      URL.revokeObjectURL(objectUrl);
      return image;
    } catch (error) {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    }
  }
  return null;
}

function isProbablyPlaceholderImage(image, documentRef) {
  try {
    const sampleCanvas = documentRef.createElement('canvas');
    sampleCanvas.width = 48;
    sampleCanvas.height = 48;
    const sampleContext = sampleCanvas.getContext('2d', { willReadFrequently: true });
    if (!sampleContext) return false;
    sampleContext.drawImage(image, 0, 0, 48, 48);
    const pixels = sampleContext.getImageData(0, 0, 48, 48).data;
    let nearWhitePixels = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] > 238 && pixels[index + 1] > 238 && pixels[index + 2] > 238) {
        nearWhitePixels += 1;
      }
    }
    return nearWhitePixels / (pixels.length / 4) > 0.72;
  } catch (error) {
    return false;
  }
}

function safeFilePart(value) {
  return String(value ?? 'busker')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'busker';
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('The browser could not create the schedule image.'));
    }, 'image/png');
  });
}

export async function downloadScheduleStory({
  busker,
  performances,
  fromDate,
  toDate,
  imageUrls = [],
  documentRef = document,
  fetchImpl = fetch,
}) {
  const validation = validateScheduleRange(fromDate, toDate);
  if (!validation.valid) throw new Error(validation.message);

  const selectedPerformances = selectSchedulePerformances(performances, fromDate, toDate);
  if (selectedPerformances.length === 0) {
    throw new Error('No performances are loaded for the selected dates.');
  }

  const canvas = documentRef.createElement('canvas');
  canvas.width = INSTAGRAM_STORY_WIDTH;
  canvas.height = INSTAGRAM_STORY_HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas image generation is not supported in this browser.');

  const background = context.createLinearGradient(0, 0, INSTAGRAM_STORY_WIDTH, INSTAGRAM_STORY_HEIGHT);
  background.addColorStop(0, '#101327');
  background.addColorStop(0.55, '#17132e');
  background.addColorStop(1, '#25102b');
  context.fillStyle = background;
  context.fillRect(0, 0, INSTAGRAM_STORY_WIDTH, INSTAGRAM_STORY_HEIGHT);
  drawDecorations(context);

  roundedRect(context, 72, 74, 330, 52, 26);
  context.fillStyle = 'rgba(248, 36, 174, 0.18)';
  context.fill();
  context.fillStyle = '#f9a8d4';
  context.font = '800 22px Inter, Arial, sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText('LIVE SCHEDULE · SINGAPORE', 237, 101);

  const buskerName = busker?.name || 'Live performer';
  context.fillStyle = '#ffffff';
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  let nameFontSize = 78;
  context.font = `900 ${nameFontSize}px Inter, Arial, sans-serif`;
  while (nameFontSize > 52 && context.measureText(buskerName).width > 690) {
    nameFontSize -= 2;
    context.font = `900 ${nameFontSize}px Inter, Arial, sans-serif`;
  }
  context.fillText(fitText(context, buskerName, 690), 72, 230);

  const descriptor = [busker?.act, busker?.art_form].filter(Boolean).join(' · ');
  if (descriptor) {
    context.fillStyle = 'rgba(255, 255, 255, 0.7)';
    context.font = '600 28px Inter, Arial, sans-serif';
    context.fillText(fitText(context, descriptor, 690), 74, 285);
  }

  const loadedProfileImage = await loadImageFromUrls(imageUrls, fetchImpl);
  const profileImage = loadedProfileImage && !isProbablyPlaceholderImage(loadedProfileImage, documentRef)
    ? loadedProfileImage
    : null;
  drawProfile(context, profileImage, buskerName);

  context.fillStyle = '#ffffff';
  context.font = '800 46px Inter, Arial, sans-serif';
  context.fillText(formatRange(fromDate, toDate), 72, 405);
  context.fillStyle = 'rgba(255, 255, 255, 0.62)';
  context.font = '600 25px Inter, Arial, sans-serif';
  context.fillText(`${selectedPerformances.length} live ${selectedPerformances.length === 1 ? 'set' : 'sets'} · Save the dates`, 74, 449);

  context.strokeStyle = 'rgba(255, 255, 255, 0.14)';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(72, 494);
  context.lineTo(1008, 494);
  context.stroke();

  drawSchedule(context, groupSchedulePerformances(selectedPerformances));

  context.fillStyle = '#ffffff';
  context.textAlign = 'left';
  context.font = '900 54px Inter, Arial, sans-serif';
  context.fillText('SEE YOU THERE.', 72, 1762);
  context.fillStyle = '#f9a8d4';
  context.font = '800 26px Inter, Arial, sans-serif';
  context.fillText('LIVEMUSEEK.COM', 74, 1812);
  context.fillStyle = 'rgba(255, 255, 255, 0.52)';
  context.textAlign = 'right';
  context.font = '600 21px Inter, Arial, sans-serif';
  context.fillText('Schedule subject to change', 1008, 1812);

  const blob = await canvasToBlob(canvas);
  const downloadUrl = URL.createObjectURL(blob);
  const link = documentRef.createElement('a');
  link.href = downloadUrl;
  link.download = `${safeFilePart(buskerName)}-schedule-${fromDate}-to-${toDate}.png`;
  documentRef.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(downloadUrl);

  return { filename: link.download, performanceCount: selectedPerformances.length };
}
