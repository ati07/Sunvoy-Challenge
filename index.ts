import { promises as fs } from 'fs';
import * as path from 'path';
import * as cheerio from 'cheerio';

interface Credentials { cookies: string; }
interface NonceResponse { nonce: string; cookies: string | null; }

const config = {
  BASE_URL: 'https://challenge.sunvoy.com',
  LOGIN_PAGE_URL: 'https://challenge.sunvoy.com/login',
  LOGIN_URL: 'https://challenge.sunvoy.com/login',
  CREDENTIALS_FILE: path.join(__dirname, 'session.json'),
};


async function getNonce(): Promise<NonceResponse> {
  try {
    const response: Response = await fetch(config.LOGIN_PAGE_URL, {
      method: 'GET',
      headers: {
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
        'accept-language': 'en-US,en;q=0.9',
        'cache-control': 'max-age=0',
        'upgrade-insecure-requests': '1',
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const text: string = await response.text();
    const $ = cheerio.load(text);
    const nonce: string | undefined = $('input[name="nonce"]').val();
    if (!nonce) {
      console.error('Login page HTML:', text);
      throw new Error('Nonce not found in login page');
    }
    console.log('Nonce extracted:', nonce);
    const cookies: string | null = response.headers.get('set-cookie');
    console.log('GET cookies:', cookies || 'No cookies');
    return { nonce, cookies };
  } catch (error: any) {
    console.error('Failed to fetch nonce:', error.message);
    throw error;
  }
}
async function login({ nonce, cookies }: NonceResponse): Promise<string> {
  try {
    const formData: string = `nonce=${nonce}&username=demo%40example.org&password=test`;
    console.log('Login form data:', formData);
    const response: Response = await fetch(config.LOGIN_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
        'accept-language': 'en-US,en;q=0.9',
        'cache-control': 'max-age=0',
        'origin': config.BASE_URL,
        'referer': config.LOGIN_PAGE_URL,
        'content-length': Buffer.byteLength(formData).toString(),
        'sec-ch-ua': '"Google Chrome";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'same-origin',
        'sec-fetch-user': '?1',
        'upgrade-insecure-requests': '1',
        ...(cookies ? { 'cookie': cookies } : {}),
      },
      body: formData,
      redirect: 'manual',
    });
    if (response.status < 200 || response.status >= 400) {
      const text: string = await response.text();
      console.error('Login response status:', response.status);
      console.error('Login response data:', text);
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const $ = cheerio.load(await response.text());
    const errorMessage: string = $('body').text().trim();
    if (errorMessage) {
      console.error('Login response body text:', errorMessage);
    }
    const responseCookies: string | null = response.headers.get('set-cookie');
    if (!responseCookies) {
      console.error('Login response headers:', Object.fromEntries(response.headers));
      throw new Error('No cookies received from login');
    }
    const cookieString: string = responseCookies;
    await fs.writeFile(config.CREDENTIALS_FILE, JSON.stringify({ cookies: cookieString }, null, 2));
    console.log('Login successful, cookies:', cookieString);
    return cookieString;
  } catch (error: any) {
    console.error('Login failed:', error.message);
    throw error;
  }
}


async function getCredentials(): Promise<string> {
  
  const nonceResponse: NonceResponse = await getNonce(); // get nonce token and cookies
  return await login(nonceResponse);
}

async function main(): Promise<void> {
  const cookies = await getCredentials();
  console.log('Logged in with cookies:', cookies);
}

main();