import { chromium } from 'playwright';

(async () => {
    console.log("Iniciando navegador...");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Login
    console.log("Navegando a la app...");
    await page.goto('http://localhost:5175'); // Vite preview de frontend

    // Rellenando login
    console.log("Haciendo login con admin...");
    await page.fill('input[type="email"]', 'admin@mepal.com.co');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');

    // Esperar a que cargue la dashboard
    await page.waitForTimeout(3000);

    console.log("Tomando captura...");
    await page.screenshot({ path: '/tmp/admin_dashboard.png', fullPage: true });

    console.log("Cerrando navegador.");
    await browser.close();
})();
