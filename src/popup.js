// IIFE
(() => {

// Internally we use "favourites" but the default to display is "favorites"
const FAVXRITES = chrome.i18n.getMessage('favourites') || 'favorites'
const FAVXRITES_CAP = chrome.i18n.getMessage('favouritesCap') || 'Favorites'

const EXTENSION_NAME = `Site ${FAVXRITES_CAP}`
const EXTENSION_NAME_ALT = `Site ${FAVXRITES_CAP === 'Favorites' ? 'Favourites' : 'Favorites'}`
const EXTENSION_VERSION = '1.1' // Can't read the manifest from here

let fullDomain = 'unknown'
let baseDomain = 'unknown'
let currentDomain = 'unknown'

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

async function getOtherBookmarksFolder() {
    const topLevel = (await chrome.bookmarks.getChildren('0'))
    return topLevel[1]
}
async function getFavouritesFolder() {
    const otherBookmarksFolder = await getOtherBookmarksFolder()
    return await getChildByTitles(otherBookmarksFolder.id, [EXTENSION_NAME, EXTENSION_NAME_ALT])
}
async function getDomainFolder(domain) {
    const favouritesFolder = await getFavouritesFolder()
    return favouritesFolder && await getChildByTitle(favouritesFolder.id, domain)
}
async function getDomainBookmarks(domain) {
    const folder = await getDomainFolder(domain)
    return await chrome.bookmarks.getChildren(folder.id)
}
async function getOrCreateFavouritesFolder(domain) {
    const favouritesFolder = await getFavouritesFolder()
    return favouritesFolder || await chrome.bookmarks.create({title: EXTENSION_NAME})
}

async function addBookmark(bookmark) {
    const children = await chrome.bookmarks.getChildren(bookmark.parentId)
    const titleUpper = bookmark.title.toUpperCase()
    const index = children.findIndex(_ => _.title.toUpperCase() > titleUpper)
    if (index >= 0) {
        bookmark.index = index
    }
    return await chrome.bookmarks.create(bookmark)
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

async function saveOrderedBookmark(domain, bookmark) {
    const domainFolder = await getOrCreateDomainFolder(domain)
    const existing = await getChildByUrl(domainFolder.id, bookmark.url)
    if (existing) {
        return chrome.bookmarks.update(existing.id, {
            title: bookmark.title
        })
    }
    else {
        return await addBookmark({
            parentId: domainFolder.id,
            title: bookmark.title,
            url: bookmark.url
        })
    }
}

initialise()
return

async function initialise () {
    const tabs = await chrome.tabs.query({currentWindow: true, active: true})
    if (tabs[0]) {
        fullDomain = new URL(tabs[0].url).hostname
        baseDomain = getBaseDomain(fullDomain)
        if (fullDomain !== baseDomain) {
            // Pre-select full domain if it has bookmarks, otherwise base
            $('.sf-site-selector').addClass('enabled').on('click', onToggleDomain)
            const fullFavourites = await getDomainBookmarks(fullDomain)
            await setDomain(fullFavourites?.length ? fullDomain : baseDomain)
        } else {
            await setDomain(baseDomain)
        }
    }
    $('span.favourites').text(FAVXRITES)
    $('span.favouritesCap').text(FAVXRITES_CAP)
    $('.sf-add').on('click', onAdd)
    $('.sf-favourites').on('click', '.sf-remove', onRemove)
    $('.sf-favourites').on('click', '.sf-link', onLink)
}

// Given a full domain (e.g. yats.solnet.co.nz), return the base (e.g. solnet.co.nz)
function getBaseDomain(fullDomain) {
    let matches
    if (matches = fullDomain.match(/([^.]+\.[^.]{2,4}\.[^.]{2})$/)) {
        return matches[0]
    }
    else if (matches = fullDomain.match(/([^.]+\.[^.]{2,})$/)) {
        return matches[0]
    }
    else {
        return fullDomain
    }
}

async function onToggleDomain(event) {
    event.preventDefault()
    await setDomain(currentDomain === fullDomain ? baseDomain : fullDomain)
}

async function setDomain(domain) {
    currentDomain = domain
    $('h1 .sf-site').text(currentDomain)
    const favourites = await getDomainBookmarks(currentDomain)
    clearFavouritesMenu()
    favourites?.forEach(addToFavouritesMenu)
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

async function addToFavourites ({title, url} = {}) {
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

function addToFavouritesMenu({title, url, id}) {
    $('.sf-favourites li')
        .filter(function () {return $(this).find('.sf-link').attr('href') === url})
        .remove()
    const newItem = $(`<li><a href="#" class="sf-remove">&times;</a><a class="sf-link" href="${url}" title="${url}">${title}</a>`)
        .data('id', id)
    const titleUpper = title.toUpperCase()
    const nextLi = $('.sf-favourites li')
        .filter(function () {return $(this).find('.sf-link').text().toUpperCase() > titleUpper})
    if (nextLi.length > 0) {
        nextLi.first().before(newItem)
    }
    else {
        $('.sf-favourites').append(newItem)
    }
}

async function removeFromFavourites (listItem) {
    await chrome.bookmarks.remove(listItem.data('id'))
    listItem.addClass('deleted')
        .on('transitionend', () => { listItem.remove() })
}

async function goToFavourite (listItem) {
    const url = listItem.find('.sf-link').attr('href')
    const tabs = await chrome.tabs.query({currentWindow: true, active: true})
    await chrome.scripting.executeScript({
        func: (url) => document.location = url,
        args: [url],
        target: { tabId: tabs[0].id },
    })
}

// End of IIFE
})()
