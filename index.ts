import * as cheerio from 'cheerio';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

interface Credentials { cookies: string; }
interface NonceResponse { nonce: string; cookies: string | null; }

interface User {
  id?: string;
  email?: string;
  [key: string]: any;
}

interface Tokens {
  access_token: string;
  userId: string;
  openId: string;
  operateId: string;
  apiuser: string;
  language: string;
}

interface SignedRequest {
  payload: string;
  checkcode: string;
  fullPayload: string;
  timestamp: string;
}

const config = {
  BASE_URL: 'https://challenge.sunvoy.com',
  LOGIN_PAGE_URL: 'https://challenge.sunvoy.com/login',
  LOGIN_URL: 'https://challenge.sunvoy.com/login',
  TOKENS_URL: 'https://challenge.sunvoy.com/settings/tokens',
  USERS_URL: 'https://challenge.sunvoy.com/api/users',
  SETTINGS_URL: 'https://api.challenge.sunvoy.com/api/settings',
  CREDENTIALS_FILE: path.join(__dirname, 'session.json'),
  OUTPUT_FILE: path.join(__dirname, 'users.json'),
};

// Function to create checkcode and signed request
function createSignedRequest(params: Record<string, string>): SignedRequest {
  const timestamp: string = Math.floor(Date.now() / 1000).toString();
  const payload: Record<string, string> = { ...params, timestamp };
  const sortedKeys: string[] = Object.keys(payload).sort();
  const encodedPayload: string = sortedKeys
    .map((key: string) => `${key}=${encodeURIComponent(payload[key])}`)
    .join('&');
  const hmac: crypto.Hmac = crypto.createHmac('sha1', 'mys3cr3t');
  hmac.update(encodedPayload);
  const checkcode: string = hmac.digest('hex').toUpperCase();
  return {
    payload: encodedPayload,
    checkcode,
    fullPayload: `${encodedPayload}&checkcode=${checkcode}`,
    timestamp,
  };
}

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

async function areCredentialsValid(cookies: string): Promise<boolean> {
  try {
    const response: Response = await fetch(config.TOKENS_URL, {
      method: 'GET',
      headers: {
        'cookie': cookies,
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
      },
    });
    if (response.status !== 200) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    console.log('Credentials are valid');
    return true;
  } catch (error: any) {
    console.error('Credential validation failed:', error.message);
    return false;
  }
}

async function getCredentials(): Promise<string> {
  try {
    const sessionData: string = await fs.readFile(config.CREDENTIALS_FILE, 'utf8');
    const { cookies }: Credentials = JSON.parse(sessionData);
    if (await areCredentialsValid(cookies)) {
      console.log('Reusing existing credentials');
      return cookies;
    }
  } catch {
    console.log('No valid credentials found, logging in');
  }
  const nonceResponse: NonceResponse = await getNonce(); // get nonce token and cookies
  return await login(nonceResponse);
}

// fetching toknes to fetch the current user details
async function fetchTokens(cookies: string): Promise<Tokens> {
  try {
    const response: Response = await fetch(config.TOKENS_URL, {
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
        'referer': `${config.BASE_URL}/settings`,
        'referrer-policy': 'strict-origin-when-cross-origin',
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const text: string = await response.text();
    const $ = cheerio.load(text);
    const tokens: Tokens = {
      access_token: $('#access_token').val() || '',
      userId: $('#userId').val() || '',
      openId: $('#openId').val() || '',
      operateId: $('#operateId').val() || '',
      apiuser: $('#apiuser').val() || '',
      language: $('#language').val() || '',
    };
    console.log('Tokens extracted:', tokens);
    if (!tokens.access_token || !tokens.userId) {
      console.error('Tokens response HTML:', text);
      throw new Error('Failed to extract required tokens');
    }
    return tokens;
  } catch (error: any) {
    console.error('Failed to fetch tokens:', error.message);
    throw error;
  }
}


async function fetchCurrentUser(cookies: string): Promise<User> {
  try {
    const tokens: Tokens = await fetchTokens(cookies);
    const params: Record<string, string> = {
      access_token: tokens.access_token,
      apiuser: tokens.apiuser,
      language: tokens.language,
      openId: tokens.openId,
      operateId: tokens.operateId,
      userId: tokens.userId,
    };
    const { fullPayload }: SignedRequest = createSignedRequest(params);
    console.log('Settings form data:', fullPayload);
    const response: Response = await fetch(config.SETTINGS_URL, {
      method: 'POST',
      headers: {
        'cookie': cookies,
        'accept': '*/*',
        'accept-language': 'en-US,en;q=0.9',
        'content-type': 'application/x-www-form-urlencoded',
        'priority': 'u=1, i',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36',
        'sec-ch-ua': '"Google Chrome";v="137", "Chromium";v="137", "Not/A)Brand";v="24"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-site',
        'referer': config.BASE_URL,
        'referrer-policy': 'strict-origin-when-cross-origin',
        'content-length': Buffer.byteLength(fullPayload).toString(),
      },
      body: fullPayload,
    });
    if (!response.ok) {
      const text: string = await response.text();
      console.error('Response status:', response.status);
      console.error('Response data:', text);
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data: User = await response.json();
    console.log('Current user fetched successfully, data:', JSON.stringify(data, null, 2));
    return data;
  } catch (error: any) {
    console.error('Failed to fetch current user:', error.message);
    throw error;
  }
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

  let users: User[] = [];
  try {
    users = await fetchUsers(cookies);
    console.log('Users API result length:', users.length);
  } catch (error: any) {
    console.error('Skipping users fetch due to error:', error.message);
  }

  let currentUser: User = {};
    try {
      currentUser = await fetchCurrentUser(cookies);
    } catch (error: any) {
      console.error('Skipping current user fetch due to error:', error.message);
    }
    const allUsers: User[] = [...users, currentUser].filter((u: User) => Object.keys(u).length > 0);

    if (allUsers.length !== 10) {
      console.warn(`Expected 10 users, got ${allUsers.length}`);
    }

    await fs.writeFile(config.OUTPUT_FILE, JSON.stringify(allUsers, null, 2));
    console.log(`Data saved to ${config.OUTPUT_FILE}`);
}

main();