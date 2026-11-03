import { expect, test, type Page } from '@playwright/test'
import JSZip from 'jszip'
import { readFile } from 'node:fs/promises'

const shots = 'test-output/screenshots'

async function open(page: Page, { tutorial = false } = {}) {
  await page.addInitScript((t) => {
    if (!t) localStorage.setItem('mesafacil:tutorial', 'pulado')
    if (!localStorage.getItem('mesafacil:criador')) localStorage.setItem('mesafacil:criador', String(Date.now()))
  }, tutorial)
  await page.goto('./')
  await expect(page.getByRole('heading', { name: 'MesaFácil', exact: true })).toBeAttached()
}

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1000) < 1024

async function showPane(page: Page, pane: 'params' | 'view' | 'summary') {
  if (isMobile(page)) await page.getByTestId(`pane-${pane}`).click()
  else if (pane === 'summary') await page.getByTestId('tab-summary').click()
  else if (pane === 'view' && (await page.getByTestId('tab-summary').getAttribute('aria-selected')) === 'true') await page.getByTestId('tab-top').click()
}

test('abre com o exemplo de 384 furos e projeto válido', async ({ page }, info) => {
  await open(page)
  await showPane(page, 'params')
  await expect(page.getByTestId('hole-count')).toHaveText('384 furos')
  await showPane(page, 'view')
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'valid')
  await page.screenshot({ path: `${shots}/${info.project.name}-inicial.png` })
})

test('alterar parâmetros atualiza furos, desenho e validação', async ({ page }) => {
  await open(page)
  await showPane(page, 'params')
  await page.getByTestId('top-length').fill('1000')
  await expect(page.getByTestId('hole-count')).toHaveText('320 furos')
  await page.getByTestId('hole-diameter').fill('60')
  await showPane(page, 'view')
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'invalid')
  await expect(page.getByTestId('status')).toContainText('maior ou igual ao espaçamento')
  await showPane(page, 'summary')
  await expect(page.getByTestId('download-zip')).toBeDisabled()
})

test('laterais e reforços aparecem na lista de peças e o ZIP contém os DXF', async ({ page }, info) => {
  await open(page)
  await showPane(page, 'params')
  await page.getByTestId('sides-toggle').click()
  await page.getByTestId('ribs-toggle').click()
  await showPane(page, 'view')
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'valid')
  await expect(page.getByTestId('legend')).toContainText('Reforços')
  await page.screenshot({ path: `${shots}/${info.project.name}-estrutura.png` })
  await page.getByTestId('tab-parts').click()
  await page.screenshot({ path: `${shots}/${info.project.name}-pecas.png` })
  await showPane(page, 'summary')
  const table = page.getByTestId('bom-table')
  await expect(table).toContainText('05_Reforco_Transversal.dxf')
  await expect(table).toContainText('Lateral curta')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('download-zip').click()])
  expect(download.suggestedFilename()).toBe('MesaFacil_1200x800.zip')
  const zip = await JSZip.loadAsync(await readFile((await download.path())!))
  const dxf = Object.keys(zip.files).filter((f) => f.endsWith('.dxf'))
  expect(dxf).toHaveLength(5)
  const top = await zip.file('MesaFacil_1200x800/DXF/01_Tampo.dxf')!.async('string')
  expect(top).toContain('CORTE')
  expect(top.match(/\nCIRCLE\r?\n/g)?.length).toBe(384)
})

test('copiar pedido de orçamento', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium')
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await open(page)
  await showPane(page, 'summary')
  await page.getByTestId('copy-quote').click()
  await expect(page.getByTestId('toast')).toContainText('copiado')
  const text = await page.evaluate(() => navigator.clipboard.readText())
  expect(text).toContain('Tampo: 1.200 × 800 mm')
  expect(text).toContain('01_Tampo.dxf — 1 unidade — chapa 6 mm')
})

test('salvar, alterar e carregar projeto', async ({ page }) => {
  await open(page)
  await showPane(page, 'params')
  await page.getByTestId('top-width').fill('600')
  await expect(page.getByTestId('hole-count')).toHaveText('288 furos')
  let path: string
  if (isMobile(page)) {
    const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Salvar', exact: true }).click()])
    path = (await d.path())!
  } else {
    const [d] = await Promise.all([page.waitForEvent('download'), page.getByTestId('save-project').click()])
    expect(d.suggestedFilename()).toBe('MesaFacil_1200x600.json')
    path = (await d.path())!
  }
  await page.getByTestId('top-width').fill('900')
  await expect(page.getByTestId('hole-count')).not.toHaveText('288 furos')
  await page.getByTestId('load-input').setInputFiles(path)
  await expect(page.getByTestId('toast')).toContainText('Projeto carregado')
  await expect(page.getByTestId('hole-count')).toHaveText('288 furos')
  // persistência local
  await page.reload()
  await showPane(page, 'params')
  await expect(page.getByTestId('hole-count')).toHaveText('288 furos')
})

test('acessório: configurar, adicionar ao projeto e baixar', async ({ page }, info) => {
  await open(page)
  await page.getByTestId('nav-accessories').click()
  await page.screenshot({ path: `${shots}/${info.project.name}-acessorios.png`, fullPage: true })
  await page.getByTestId('configure-esquadro-90').click()
  await expect(page.getByTestId('status')).toHaveAttribute('data-state', 'valid')
  await page.screenshot({ path: `${shots}/${info.project.name}-esquadro.png`, fullPage: true })
  const [d] = await Promise.all([page.waitForEvent('download'), page.getByTestId('accessory-zip').click()])
  const zip = await JSZip.loadAsync(await readFile((await d.path())!))
  expect(Object.keys(zip.files).filter((f) => f.endsWith('.dxf')).sort()).toEqual([
    'Esquadro_de_fixacao_90/DXF/01_Face_vertical.dxf',
    'Esquadro_de_fixacao_90/DXF/02_Base.dxf',
    'Esquadro_de_fixacao_90/DXF/03_Reforco_triangular.dxf',
  ])
  await page.getByTestId('accessory-qty').fill('4')
  await page.getByTestId('add-accessory').click()
  await page.getByTestId('nav-mesa').click()
  await showPane(page, 'summary')
  await expect(page.getByTestId('bom-table')).toContainText('Esquadro de fixação 90° — Reforço triangular')
  await expect(page.getByTestId('bom-table').locator('tr', { hasText: 'Reforço triangular' })).toContainText('8')
})

test('tutorial no primeiro acesso: avançar, voltar, concluir e reiniciar', async ({ page }, info) => {
  await open(page, { tutorial: true })
  const dlg = page.getByTestId('tutorial')
  await expect(dlg).toContainText('Bem-vindo ao MesaFácil!')
  await expect(page.getByTestId('tutorial-next')).toBeFocused()
  await page.getByTestId('tutorial-next').click()
  await expect(dlg).toContainText('Medidas do tampo')
  await page.screenshot({ path: `${shots}/${info.project.name}-tutorial.png` })
  await page.getByRole('button', { name: 'Voltar' }).click()
  await expect(dlg).toContainText('Bem-vindo')
  for (let i = 0; i < 7; i++) await page.getByTestId('tutorial-next').click()
  await expect(dlg).toContainText('Pedido de orçamento')
  await page.getByTestId('tutorial-next').click() // Concluir
  await expect(dlg).toBeHidden()
  await page.reload()
  await expect(page.getByTestId('tutorial')).toBeHidden()
  await page.getByTestId('help').click()
  await expect(page.getByTestId('tutorial')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('tutorial')).toBeHidden()
})

test('pular o tutorial e usar normalmente', async ({ page }) => {
  await open(page, { tutorial: true })
  await page.getByTestId('tutorial-skip').click()
  await expect(page.getByTestId('tutorial')).toBeHidden()
  expect(await page.evaluate(() => localStorage.getItem('mesafacil:tutorial'))).toBe('pulado')
  await showPane(page, 'params')
  await page.getByTestId('top-length').fill('1500')
  await expect(page.getByTestId('hole-count')).toHaveText('480 furos')
})

test('resumo e ações principais ficam visíveis sem rolar', async ({ page }) => {
  await open(page)
  await showPane(page, 'view')
  const strip = page.getByTestId('summary-strip')
  await expect(strip).toBeInViewport()
  await expect(strip).toContainText('384')
  await expect(strip.getByRole('button', { name: /Baixar projeto completo|ZIP/ })).toBeInViewport()
})

test('divulgação do canal ao abrir, uma vez a cada 7 dias', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('mesafacil:tutorial', 'concluido')
    if (!sessionStorage.getItem('visto')) {
      localStorage.removeItem('mesafacil:criador')
      sessionStorage.setItem('visto', '1')
    }
  })
  await page.goto('./')
  const modal = page.getByTestId('creator-modal')
  await expect(modal).toBeVisible()
  await expect(modal.getByRole('link', { name: /YouTube/ })).toHaveAttribute('href', 'https://www.youtube.com/@vmgarage_oficial')
  await expect(modal.getByRole('link', { name: /Instagram/ })).toHaveAttribute('href', 'https://www.instagram.com/vmgarage.oficial/')
  await page.getByTestId('creator-close').click()
  await expect(modal).toBeHidden()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'MesaFácil', exact: true })).toBeAttached()
  await expect(modal).toBeHidden()
})

test('visualização 3D desenha a mesa e o esquadro', async ({ page }, info) => {
  await open(page)
  await showPane(page, 'params')
  await page.getByTestId('sides-toggle').click()
  await showPane(page, 'view')
  await page.getByTestId('tab-3d').click()
  const canvas = page.getByTestId('viewer-3d').locator('canvas')
  await expect(canvas).toBeVisible()
  // a cena não pode estar vazia: conta cores diferentes do fundo
  const painted = async () =>
    canvas.evaluate((c: HTMLCanvasElement) => {
      const tmp = document.createElement('canvas')
      tmp.width = c.width
      tmp.height = c.height
      const ctx = tmp.getContext('2d')!
      ctx.drawImage(c, 0, 0)
      const d = ctx.getImageData(0, 0, tmp.width, tmp.height).data
      let n = 0
      for (let i = 0; i < d.length; i += 4 * 97) if (Math.abs(d[i] - 0xf4) > 12 || Math.abs(d[i + 2] - 0xf8) > 12) n++
      return n
    })
  await expect.poll(painted).toBeGreaterThan(200)
  await page.screenshot({ path: `${shots}/${info.project.name}-3d.png` })
  // animar montagem move o controle da vista explodida sozinho
  const slider = page.locator('#explode')
  await page.getByTestId('animate-assembly').click()
  await expect(page.getByTestId('animate-assembly')).toHaveText('Parar')
  await expect.poll(async () => Number(await slider.inputValue())).toBeGreaterThan(0.3)
  await page.getByTestId('animate-assembly').click()
  await expect(page.getByTestId('animate-assembly')).toHaveText('Animar montagem')
  await page.getByTestId('nav-accessories').click()
  await page.getByTestId('configure-esquadro-90').click()
  await page.getByTestId('accessory-tab-3d').click()
  await expect(page.getByTestId('viewer-3d').locator('canvas')).toBeVisible()
  await page.screenshot({ path: `${shots}/${info.project.name}-esquadro-3d.png` })
})

test('sem rolagem horizontal da página', async ({ page }) => {
  await open(page)
  for (const pane of ['params', 'view', 'summary'] as const) {
    await showPane(page, pane)
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow, pane).toBeLessThanOrEqual(0)
  }
})
