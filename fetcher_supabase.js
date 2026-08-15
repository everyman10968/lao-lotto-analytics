import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import * as cheerio from 'cheerio';

const SUPABASE_URL = 'https://xrnwxmwkisamxygevpgu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhybnd4bXdraXNhbXh5Z2V2cGd1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY3NjY5MDIsImV4cCI6MjEwMjM0MjkwMn0.GmXpYgrxSN4IlQ6pq_Q3qar__iFDIqx0yE4gWPcamgA';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const MONTH_MAP = {
  'มกราคม': '01', 'ม.ค.': '01',
  'กุมภาพันธ์': '02', 'ก.พ.': '02',
  'มีนาคม': '03', 'มี.ค.': '03',
  'เมษายน': '04', 'เม.ย.': '04',
  'พฤษภาคม': '05', 'พ.ค.': '05',
  'มิถุนายน': '06', 'มิ.ย.': '06',
  'กรกฎาคม': '07', 'ก.ค.': '07',
  'สิงหาคม': '08', 'ส.ค.': '08',
  'กันยายน': '09', 'ก.ย.': '09',
  'ตุลาคม': '10', 'ต.ค.': '10',
  'พฤศจิกายน': '11', 'พ.ย.': '11',
  'ธันวาคม': '12', 'ธ.ค.': '12'
};

const DAY_NAMES = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

function parseThaiDate(text) {
  const words = text.split(/\s+/);
  for (let i = 0; i < words.length - 2; i++) {
    const day = words[i].replace(/[^\d]/g, '');
    const monthName = words[i+1];
    const yearStr = words[i+2].replace(/[^\d]/g, '');
    if (day && day.length <= 2 && MONTH_MAP[monthName] && yearStr.length === 4) {
      const yearBE = parseInt(yearStr, 10);
      const yearAD = yearBE > 2500 ? yearBE - 543 : yearBE;
      const month = MONTH_MAP[monthName];
      const dateStr = `${yearAD}-${month}-${day.padStart(2, '0')}`;
      const d = new Date(`${dateStr}T00:00:00Z`);
      const dayOfWeek = DAY_NAMES[d.getUTCDay()];
      return { dateStr, dayOfWeek };
    }
  }
  return null;
}

export async function fetchLatestAndSyncSupabase() {
  console.log(`[${new Date().toISOString()}] Checking Sanook for latest Lao Lotto 4-Digit results...`);
  
  try {
    const tagRes = await axios.get('https://news.sanook.com/tag/ตรวจหวยลาว/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });
    const $ = cheerio.load(tagRes.data);
    const articles = [];

    $('a').each((_, el) => {
      const href = $(el).attr('href');
      const title = $(el).text().trim();
      if (href && href.match(/\/news\/\d{7}\//) && title.includes('หวยลาว')) {
        if (!articles.some(a => a.href === href)) {
          articles.push({ title, href });
        }
      }
    });

    console.log(`Found ${articles.length} articles to check on Sanook.`);

    const recordsToSync = [];
    for (const art of articles.slice(0, 8)) {
      try {
        const artRes = await axios.get(art.href, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          },
          timeout: 8000
        });
        const $art = cheerio.load(artRes.data);
        const artTitle = $art('title').text();
        const text = $art('body').text().replace(/\s+/g, ' ');

        const dateObj = parseThaiDate(artTitle) || parseThaiDate(text);
        const numMatch = text.match(/เลข 4 ตัว\s*[:\s]*(\d{4})/i) || 
                         text.match(/4 ตัว\s*[:\s]*(\d{4})/i) ||
                         text.match(/เลข 4 ตัวออก\s*(\d{4})/i) ||
                         text.match(/4 ตัวคือ\s*(\d{4})/i);

        if (dateObj && numMatch) {
          const num4 = numMatch[1];
          recordsToSync.push({
            draw_date: dateObj.dateStr,
            day_of_week: dateObj.dayOfWeek,
            number_full: num4,
            number_4digit: num4,
            head_2digit: num4.slice(0, 2),
            tail_2digit: num4.slice(2),
            tail_3digit: num4.slice(1)
          });
        }
      } catch (err) {}
    }

    if (recordsToSync.length > 0) {
      const { data, error } = await supabase
        .from('lao_lottery_analytics')
        .upsert(recordsToSync, { onConflict: 'draw_date' });
      
      if (error) {
        console.error('Supabase Upsert Error:', error.message);
      } else {
        console.log(`Successfully synced ${recordsToSync.length} draw records directly to Supabase!`);
      }
    }
  } catch (err) {
    console.error('Fetcher Error:', err.message);
  }
}

fetchLatestAndSyncSupabase();
