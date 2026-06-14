const endpoints = [
  'https://appel-q97a.onrender.com/api',
  'https://appel-backend-staging.onrender.com/api',
];

const body = {
  email: 'demo@appel-review.com',
  lozinka: 'AppelDemo2026!',
};

async function check(base) {
  const loginRes = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const loginJson = await loginRes.json();
  if (!loginRes.ok || !loginJson?.token) {
    return { base, loginStatus: loginRes.status, error: loginJson };
  }

  const servicesRes = await fetch(`${base}/services?limit=1&skip=0&includeDeleted=true`, {
    headers: { Authorization: `Bearer ${loginJson.token}` },
  });
  const servicesJson = await servicesRes.json();

  return {
    base,
    loginStatus: loginRes.status,
    servicesStatus: servicesRes.status,
    total: servicesJson?.total,
    count: servicesJson?.count,
  };
}

(async () => {
  for (const e of endpoints) {
    try {
      const result = await check(e);
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      console.log(JSON.stringify({ base: e, error: err.message }, null, 2));
    }
  }
})();
