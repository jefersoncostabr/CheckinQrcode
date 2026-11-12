const menuItems = [
    { label: 'Painel', href: '/adm', roles: ['owner', 'admin', 'operator', 'viewer', 'user'] },
    { label: 'Adicionar presença', href: '/adm/adicionar-manual', roles: ['owner', 'admin', 'operator', 'user'] },
    { label: 'Monitor facial', href: '/adm/monitor-facial', roles: ['owner', 'admin'] },
    { label: 'Relatório', href: '/adm/relatorio', roles: ['owner', 'admin', 'viewer'] },
]

function createNavbar(tenant) {
    const nav = document.createElement('nav')
    nav.className = 'wraperNavegacao'
    nav.setAttribute('aria-label', 'Navegação principal')

    const header = document.createElement('div')
    header.className = 'navbarHeader'

    const brand = document.createElement('a')
    brand.className = 'navbarBrand'
    brand.href = '/adm'
    brand.textContent = 'Check-in'

    const tenantName = document.createElement('span')
    tenantName.className = 'navbarTenant'
    tenantName.textContent = `${tenant.name} · ${tenant.role}`

    const toggle = document.createElement('button')
    toggle.className = 'menuHamburger'
    toggle.type = 'button'
    toggle.setAttribute('aria-label', 'Abrir menu')
    toggle.setAttribute('aria-expanded', 'false')
    toggle.setAttribute('aria-controls', 'ulMenu')
    toggle.innerHTML = '<span></span><span></span><span></span>'

    header.append(brand, tenantName, toggle)

    const menu = document.createElement('ul')
    menu.className = 'ulMenu'
    menu.id = 'ulMenu'

    menuItems
        .filter(item => item.roles.includes(tenant.role))
        .forEach(item => {
            const listItem = document.createElement('li')
            listItem.className = 'listMenu'
            const link = document.createElement('a')
            link.className = 'linkMenu'
            link.href = item.href
            link.textContent = item.label
            listItem.appendChild(link)
            menu.appendChild(listItem)
        })

    const logoutItem = document.createElement('li')
    logoutItem.className = 'listMenu'
    const logout = document.createElement('button')
    logout.className = 'linkMenu navbarLogout'
    logout.type = 'button'
    logout.textContent = 'Sair'
    logoutItem.appendChild(logout)
    menu.appendChild(logoutItem)

    const status = document.createElement('p')
    status.className = 'navbarStatus'
    status.setAttribute('role', 'status')
    status.setAttribute('aria-live', 'polite')
    status.hidden = true

    toggle.addEventListener('click', () => {
        const isOpen = menu.classList.toggle('ulMenuClicado')
        toggle.setAttribute('aria-expanded', String(isOpen))
        toggle.setAttribute('aria-label', isOpen ? 'Fechar menu' : 'Abrir menu')
    })

    menu.addEventListener('click', event => {
        if (event.target.closest('a')) {
            menu.classList.remove('ulMenuClicado')
            toggle.setAttribute('aria-expanded', 'false')
            toggle.setAttribute('aria-label', 'Abrir menu')
        }
    })

    document.addEventListener('click', event => {
        if (!nav.contains(event.target)) {
            menu.classList.remove('ulMenuClicado')
            toggle.setAttribute('aria-expanded', 'false')
            toggle.setAttribute('aria-label', 'Abrir menu')
        }
    })

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && menu.classList.contains('ulMenuClicado')) {
            menu.classList.remove('ulMenuClicado')
            toggle.setAttribute('aria-expanded', 'false')
            toggle.setAttribute('aria-label', 'Abrir menu')
            toggle.focus()
        }
    })

    logout.addEventListener('click', async () => {
        logout.disabled = true
        status.hidden = true
        try {
            const response = await fetch('/api/tenant/auth/logout', { method: 'POST' })
            if (!response.ok) throw new Error('Não foi possível encerrar a sessão.')
            window.location.replace('/login?loggedout=1')
        } catch (error) {
            status.textContent = error.message
            status.hidden = false
            logout.disabled = false
        }
    })

    nav.append(header, menu, status)
    document.body.prepend(nav)
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const response = await fetch('/api/tenant/auth/session', { cache: 'no-store' })
        if (response.status === 401) {
            window.location.replace('/login')
            return
        }
        const data = await response.json()
        if (!response.ok) throw new Error(data.mensagem || 'Não foi possível carregar a navegação.')
        createNavbar(data.tenant)
    } catch (error) {
        console.error('Erro ao carregar navegação:', error)
        const status = document.createElement('p')
        status.className = 'navbarStatus navbarLoadError'
        status.setAttribute('role', 'alert')
        status.textContent = error.message
        document.body.prepend(status)
    }
})
