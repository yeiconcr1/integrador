import { chromium } from 'playwright';

(async () => {
    console.log("Iniciando navegador test...");
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    const errors = [];
    page.on('pageerror', exception => {
        errors.push(`PageError: ${exception}`);
    });
    page.on('console', msg => {
        if (msg.type() === 'error') {
            errors.push(`ConsoleError: ${msg.text()}`);
        }
    });
    page.on('requestfailed', request => {
        errors.push(`RequestFailed: ${request.url()} - ${request.failure().errorText}`);
    });
    page.on('response', response => {
        if (!response.ok()) {
            errors.push(`ResponseNotOk: ${response.url()} - ${response.status()}`);
        }
    });

    // Login
    await page.goto('http://localhost:5175');
    await page.fill('input[type="email"]', 'admin@mepal.com.co');
    await page.fill('input[type="password"]', 'admin123');
    await page.click('button[type="submit"]');

    // Esperar a que cargue la dashboard
    await page.waitForTimeout(2000);

    console.log("Clicking 'Datos BOM'...");
    await page.click('text=Datos BOM');

    await page.waitForTimeout(2000);

    await page.screenshot({ path: '/tmp/admin_datosbom.png', fullPage: true });

    if (errors.length > 0) {
        console.log("ERRORES DETECTADOS:", errors);
    } else {
        console.log("Ningún error capturado.");
    }

    await browser.close();
})();
