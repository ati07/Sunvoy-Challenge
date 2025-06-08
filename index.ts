import { promises as fs } from 'fs';
import * as path from 'path';
import * as cheerio from 'cheerio';

interface Credentials { cookies: string; }
interface NonceResponse { nonce: string; cookies: string | null; }

interface User {
  id?: string;
  email?: string;
  [key: string]: any;
}

const config = {
  BASE_URL: 'https://challenge.sunvoy.com',
  LOGIN_PAGE_URL: 'https://challenge.sunvoy.com/login',
  LOGIN_URL: 'https://challenge.sunvoy.com/login',
  USERS_URL: 'https://challenge.sunvoy.com/api/users',
  CREDENTIALS_FILE: path.join(__dirname, 'session.json'),
  OUTPUT_FILE: path.join(__dirname, 'users.json'),
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


async function fetchUsers(cookies: string): Promise<User[]> {
  try {
    const response: Response = await fetch(config.USERS_URL, {
      method: 'POST',
      headers: {
        'cookie': cookies,
        'accept': '*/*',
        'accept-language': 'en-US,en;q=0.9',
        'priority': 'u=1, i',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
        'sec-ch-ua': '"Google Chrome";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        'referer': `${config.BASE_URL}/list`,
        'referrer-policy': 'strict-origin-when-cross-origin',
      },
    });
    if (!response.ok) {
      const text: string = await response.text();
      console.error('Response status:', response.status);
      console.error('Response data:', text);
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data: User[] = await response.json();
    console.log('Users fetched successfully (POST), data:', JSON.stringify(data, null, 2));
    if (!Array.isArray(data) || data.length === 0) {
      console.warn('Users API returned no data or invalid format');
    }
    return data;
  } catch (error: any) {
    console.error('Failed to fetch users (POST):', error.message);
    try {
      const response: Response = await fetch(config.USERS_URL, {
        method: 'GET',
        headers: {
          'cookie': cookies,
          'accept': '*/*',
          'accept-language': 'en-US,en;q=0.9',
          'priority': 'u=1, i',
          'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
          'sec-ch-ua': '"Google Chrome";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'sec-fetch-dest': 'empty',
          'sec-fetch-mode': 'cors',
          'sec-fetch-site': 'same-origin',
          'referer': `${config.BASE_URL}/list`,
          'referrer-policy': 'strict-origin-when-cross-origin',
        },
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data: User[] = await response.json();
      console.log('Users fetched successfully (GET), data:', JSON.stringify(data, null, 2));
      return data;
    } catch (getError: any) {
      console.error('Failed to fetch users (GET):', getError.message);
      throw getError;
    }
  }
}
async function main(): Promise<void> {
  const cookies = await getCredentials();
  // console.log('Logged in with cookies:', cookies);

  let users: User[] = [];
  try {
    users = await fetchUsers(cookies);
    console.log('Users API result length:', users.length);
  } catch (error: any) {
    console.error('Skipping users fetch due to error:', error.message);
  }
  await fs.writeFile(config.OUTPUT_FILE, JSON.stringify(users, null, 2));
  console.log(`Users saved to ${config.OUTPUT_FILE}`);
}

main();