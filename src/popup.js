// IIFE
(() => {

// Internally we use "favourite" but the default to display is "favorite"
const FAVOURITE = chrome.i18n.getMessage('favourite') || 'favorite'
const USE_ALT_SPELLING = FAVOURITE !== 'favorite'
const EXTENSION_NAME = chrome.i18n.getMessage('extensionName') || 'Site Favorites'
const EXTENSION_NAME_ALT = EXTENSION_NAME === 'Site Favorites' ? 'Site Favourites' : 'Site Favorites'

const EXTENSION_VERSION = '2.1.0' // Can't read the manifest from here

// Settings
const RECENT_DAYS = 30

// Date formats
const formatDM = new Intl.DateTimeFormat(undefined, {day: 'numeric', month: 'long'})
const formatDMY = new Intl.DateTimeFormat(undefined, {day: 'numeric', month: 'short', year: 'numeric'})

// State
let fullDomain = 'unknown'
let baseDomain = 'unknown'
let currentDomain = 'unknown'
let selectedTab = 'site' // 'site' or 'recent'
let selectedSorts = {
    site: 'name',
    recent: 'date'
 } // 'name', 'domain' or 'date'

function selectedSort() {
    return selectedSorts[selectedTab]
}

function selectSort(sort) {
    selectedSorts[selectedTab] = sort
}

initialise()
return

///// Initialise

async function initialise() {
    // Set up the UI
    const tabs = await chrome.tabs.query({currentWindow: true, active: true})
    if (tabs[0]?.url) {
        ;[fullDomain, baseDomain] = getFullAndBaseDomains(new URL(tabs[0].url).hostname)
        if (fullDomain !== baseDomain) {
            // Pre-select full domain if it has bookmarks, otherwise base
            enableSiteSelector(true)
            const fullFavourites = await getDomainBookmarks(fullDomain)
            await setDomain(fullFavourites?.length ? fullDomain : baseDomain)
        } else {
            await setDomain(baseDomain)
        }
    }
    // Adjust spelling etc
    $('.sf-extension-text').text(EXTENSION_NAME)
    $('.sf-version-text').text(EXTENSION_VERSION)
    if (USE_ALT_SPELLING) {
        $('.sf-fav-text').each(function() {
            const text = $(this).text()
            $(this).text(text.replace(/avorite/g, 'avourite'))
        })
        $('.sf-fav-title').each(function() {
            const title = $(this).attr('title')
            $(this).attr('title', title.replace(/avorite/g, 'avourite'))
        })
    }
    $('.tab-recent').attr('title', $('.tab-recent').attr('title').replace('recently', `in the last ${RECENT_DAYS} days`))
    // Event handlers
    $('.tab-site').on('click', onShowDomainFavourites)
    $('.tab-recent').on('click', onShowRecentFavourites)
    $('.sf-add').on('click', onAdd)
    $('.sf-favourites').on('click', '.sf-remove', onRemove)
    $('.sf-favourites').on('click', '.sf-link', onLink)
    $('.sf-sort').on('click', onSelectSort)
}

///// Event handlers

async function onShowDomainFavourites(event) {
    event.preventDefault()
    await showDomainFavourites()
}
async function onShowRecentFavourites(event) {
    event.preventDefault()
    await showRecentFavourites()
}
async function onToggleDomain(event) {
    event.preventDefault()
    await setDomain(currentDomain === fullDomain ? baseDomain : fullDomain)
}
async function onAdd(event) {
    event.preventDefault()
    const tabs = await chrome.tabs.query({currentWindow: true, active: true})
    await addToFavourites(tabs[0])
}
async function onRemove(event) {
    event.preventDefault()
    await removeFromFavourites($(this).closest('li'))
}
async function onLink(event) {
    event.preventDefault()
    await goToFavourite($(this).closest('li'))
    window.close()
}
function onSelectSort(event) {
    if ($(this).hasClass('sf-sort-name'))
        selectSort('name')
    else if ($(this).hasClass('sf-sort-date'))
        selectSort('date')
    else if ($(this).hasClass('sf-sort-domain'))
        selectSort('domain')
    showSelectedSort()
    sortFavourites()
}

///// Domain-specific bookmarks

async function getDomainFolder(domain) {
    const favouritesFolder = await getFavouritesFolder()
    return favouritesFolder && await getChildByTitle(favouritesFolder.id, domain)
}
async function getOrCreateDomainFolder(domain) {
    const domainFolder = await getDomainFolder(domain)
    if (domainFolder) {
        return domainFolder
    }
    else {
        const favouritesFolder = await getOrCreateFavouritesFolder()
        return await addBookmark({
            parentId: favouritesFolder.id,
            title: domain
        })
    }
}
async function getRecentBookmarks() {
    const folder = await getFavouritesFolder()
    const tree = folder && await chrome.bookmarks.getSubTree(folder.id)
    if (!tree?.[0]?.children) return []
    const all = tree[0].children.flatMap(subfolder => subfolder.children?.map(bookmark => ({ ...bookmark, domain: subfolder.title })) ?? []).filter(_ => _.url)
    const cutoff = Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000
    return all.filter(_ => _.dateAdded > cutoff)
}
async function getDomainBookmarks(domain) {
    const folder = await getDomainFolder(domain)
    return (folder && (await chrome.bookmarks.getChildren(folder.id))?.map(bookmark => ({ ...bookmark, domain }))) ?? []
}
async function saveOrderedBookmark(domain, bookmark) {
    const domainFolder = await getOrCreateDomainFolder(domain)
    const existing = await getChildByUrl(domainFolder.id, bookmark.url)
    let savedBookmark
    if (existing) {
        savedBookmark = await chrome.bookmarks.update(existing.id, {
            title: bookmark.title
        })
    }
    else {
        savedBookmark = await addBookmark({
            parentId: domainFolder.id,
            title: bookmark.title,
            url: bookmark.url
        })
    }
    return { ...savedBookmark, domain }
}

///// UI stuff

// Enable the site selector if there is one
function enableSiteSelector(enable) {
    if (enable && fullDomain !== baseDomain) {
        $('.sf-site-selector').addClass('enabled').on('click', onToggleDomain)
    } else {
        $('.sf-site-selector').removeClass('enabled').off('click', onToggleDomain)
    }
}
async function showDomainFavourites() {
    if (selectedTab === 'site') return
    selectedTab = 'site'
    $('.sf-tab-container').addClass('sf-selected-domain')
        .removeClass('sf-selected-recent')
    $('h1.tab-site').addClass('selected')
    $('h1.tab-recent').removeClass('selected')
    enableSiteSelector(true)
    await setDomain(currentDomain)
}

async function showRecentFavourites() {
    if (selectedTab === 'recent') return
    selectedTab = 'recent'
    $('.sf-tab-container').addClass('sf-selected-recent')
        .removeClass('sf-selected-domain')
    $('h1.tab-site').removeClass('selected')
    $('h1.tab-recent').addClass('selected')
    enableSiteSelector(false)
    await setRecent()
}

function renderFavourites(favourites) {
    const items = favourites.map(createFavouriteItem)
    clearFavouritesMenu()
    $('.sf-favourites').append(items)
    sortFavourites()
}

async function setDomain(domain) {
    currentDomain = domain
    $('h1 .sf-site').text(currentDomain)
    showSelectedSort()
    const favourites = await getDomainBookmarks(domain)
    // Render, but only if we're still on this tab and domain
    if (selectedTab === 'site' && currentDomain === domain) {
        renderFavourites(favourites)
    }
}

async function setRecent() {
    showSelectedSort()
    const favourites = await getRecentBookmarks()
    // Render, but only if we're still on this tab
    if (selectedTab === 'recent') {
        renderFavourites(favourites)
    }
}

function showSelectedSort() {
    $('.sf-sort-name, .sf-sort-date, .sf-sort-domain').removeClass('selected')
    $(`.sf-sort-${selectedSort()}`).addClass('selected')
}

function sortFavourites() {
    const items = $('.sf-favourites')
    let comparator
    switch (selectedSort()) {
        case 'domain':
            comparator = (a, b) => $(a).find('.sf-domain').text().localeCompare($(b).find('.sf-domain').text(), "en", { sensitivity: "base" })
            break
        case 'date':
            comparator = (a, b) => $(b).data('dateAdded') - $(a).data('dateAdded')
            break
        case 'name': // fallthrough
        default:
            comparator = (a, b) => $(a).find('.sf-link').text().localeCompare($(b).find('.sf-link').text(), "en", { sensitivity: "base" })
            break
    }
    items.children('li.sf-favourite').not('.deleted').detach().sort(comparator).appendTo(items);
}

async function addToFavourites({title, url} = {}) {
    if (url) {
        title = title || url
        const bookmark = await saveOrderedBookmark(currentDomain, {title, url})
        addToFavouritesMenu(bookmark)
        // Add, then quickly remove, the "added" class, and let css transitions fade nicely
        const items = $('.sf-favourites li').filter(function () { return $(this).find('a.sf-link').attr('href') === url })
        items.addClass('added')
        setTimeout(() => items.removeClass('added'), 100)
    }
}

function clearFavouritesMenu() {
    $('.sf-favourites').empty()
}

function createFavouriteItem(favourite) {
    const {title, url, id, dateAdded, domain} = favourite
    const domainElement = domain ? $('<span>', {class: 'sf-domain', text: domain}) : null
    const dateElement = dateAdded ? $('<span>', {class: 'sf-date', title: formatAddedDateTooltip(dateAdded), text: formatAddedDate(dateAdded)}) : null
    return ($('<li>', {class: 'sf-favourite'})
        .append($('<a>', {class: 'sf-link', href: url, title: url, text: title}))
        .append(domainElement)
        .append(dateElement)
        .append($('<span>', {class: 'sf-remove'})
            .append($('<a>', {href: '#', html: '&times;'})))
        .data('id', id)
        .data('dateAdded', dateAdded))
}

function addToFavouritesMenu(favourite) {
    // Remove if it already exists (e.g. if the title has changed)
    $('.sf-favourites li')
        .filter(function () {return $(this).find('.sf-link').attr('href') === favourite.url})
        .remove()
    const newItem = createFavouriteItem(favourite)
    $('.sf-favourites').append(newItem)
    sortFavourites()
}

async function removeFromFavourites(listItem) {
    await chrome.bookmarks.remove(listItem.data('id'))
    listItem.addClass('deleted')
        .on('transitionend', () => { listItem.remove() })
}

async function goToFavourite(listItem) {
    const url = listItem.find('.sf-link').attr('href')
    const tabs = await chrome.tabs.query({currentWindow: true, active: true})
    await chrome.scripting.executeScript({
        func: (url) => document.location = url,
        args: [url],
        target: { tabId: tabs[0].id },
    })
}

///// Generic bookmarks

async function getOtherBookmarksFolder() {
    const topLevel = (await chrome.bookmarks.getChildren('0'))
    return topLevel[1]
}
async function getFavouritesFolder() {
    const otherBookmarksFolder = await getOtherBookmarksFolder()
    // If the alternative spelling already exists, just use that
    // (to avoid ending up with both Site Favorites and Site Favourites folders)
    return await getChildByTitles(otherBookmarksFolder.id, [EXTENSION_NAME, EXTENSION_NAME_ALT])
}
async function getOrCreateFavouritesFolder() {
    const favouritesFolder = await getFavouritesFolder()
    return favouritesFolder ?? await chrome.bookmarks.create({title: EXTENSION_NAME})
}
async function getChildByTitle(parentId, title) {
    const children = await chrome.bookmarks.getChildren(parentId)
    return (children.find(_ => _.title === title))
}
async function getChildByTitles(parentId, titles) {
    const children = await chrome.bookmarks.getChildren(parentId)
    return (children.find(_ => titles.includes(_.title)))
}
async function getChildByUrl(parentId, url) {
    const children = await chrome.bookmarks.getChildren(parentId)
    return (children.find(_ => _.url === url))
}
async function addBookmark(bookmark) {
    const children = await chrome.bookmarks.getChildren(bookmark.parentId)
    const titleUpper = bookmark.title.toLocaleUpperCase()
    const index = children.findIndex(_ => _.title.toLocaleUpperCase() > titleUpper)
    if (index >= 0) {
        bookmark.index = index
    }
    return await chrome.bookmarks.create(bookmark)
}

///// Utilities

// Ignore www. where appropriate
// Given a domain (e.g. yats.solnet.co.nz), return the full domain (ignoring www. where appropriate)
// and base (e.g. solnet.co.nz)
function getFullAndBaseDomains(domain) {
    let matches
    if (matches = domain.match(/^(?:www\.)?((?:[^.]+\.)*([^.]+\.[^.]{2,4}\.[^.]{2}))$/)) {
        return [matches[1], matches[2]]
    }
    else if (matches = domain.match(/^(?:www\.)?((?:[^.]+\.)*([^.]+\.[^.]{2,}))$/)) {
        return [matches[1], matches[2]]
    }
    else {
        return [domain, domain]
    }
}

// Format a Chrome bookmark dateAdded tooltip
function formatAddedDate(timestamp) {
    const d = new Date(timestamp)
    const now = new Date()
    const fmt = d.getFullYear() === now.getFullYear() ? formatDM : formatDMY
    return fmt.format(d)
}
function formatAddedDateTooltip(timestamp) {
    return new Date(timestamp).toDateString()
}

// End of IIFE
})()
