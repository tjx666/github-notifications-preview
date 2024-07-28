import "./content.css"

import delegate from "delegate-it"
import React, { h } from "dom-chef"
import doma from "doma"
import elementReady from "element-ready"
import type { PlasmoCSConfig } from "plasmo"
import pushForm, { setFetch } from "push-form"
import { $, $$, elementExists } from "select-dom"

import { ExtensionOptions } from "~libs/options-storage"
import { empty, setTimeoutUntilVisible } from "~libs/utils"

let options: ExtensionOptions
let notifications: Notifications

// Improves Firefox support
setFetch(
  // @ts-expect-error
  typeof window.content === "object" ? window.content.fetch : window.fetch
)

class Notifications {
  dom: Promise<DocumentFragment>
  list: HTMLUListElement[]

  constructor() {
    try {
      // Firefox bug requires location.origin
      // https://github.com/sindresorhus/refined-github/issues/489
      const url = new URL("notifications", location.origin)
      if (options.participating) {
        url.searchParams.set("query", "is:unread reason:participating")
      } else {
        url.searchParams.set("query", "is:unread")
      }

      this.dom = fetch(url)
        .then((r) => r.text())
        .then((html) => doma(html) as DocumentFragment)
    } catch {
      /* Ignore network failures */
    }
  }

  async getList() {
    if (!this.list) {
      this.list = $$(
        ".notifications-list .boxed-group, .js-active-navigation-container",
        await this.dom
      )

      // Change tooltip direction
      for (const group of this.list) {
        for (const { classList } of $$(".tooltipped-s", group)) {
          classList.replace("tooltipped-s", "tooltipped-n")
        }
      }
    }

    return this.list
  }
}

function getRefinedGitHubUnreadCount() {
  const element = $("[data-rgh-unread]")
  if (!element) {
    return 0
  }

  return Number(element.dataset.rghUnread)
}

// Is the dropdown open? Is it opening?
function isOpen(element?: HTMLElement) {
  return elementExists(".NPG-container[open], .NPG-loading", element)
}

async function updateUnreadCount() {
  const latestStatusElement = $(
    ".notification-indicator .mail-status",
    await notifications.dom
  )
  const latestCount = $(
    ".js-notification-inboxes .selected .count",
    await notifications.dom
  ).textContent
  const rghCount = getRefinedGitHubUnreadCount()

  for (const statusElement of $$(".notification-indicator .mail-status")) {
    if (options.previewCount && statusElement.textContent !== latestCount) {
      statusElement.textContent = String(Number(latestCount) + rghCount) || "" // Don't show 0
    }

    statusElement.classList.toggle(
      "unread",
      !!rghCount || latestStatusElement.classList.contains("unread")
    )
    const statusElementParent = statusElement.parentNode as HTMLDivElement
    const latestStatusElementParent =
      latestStatusElement.parentNode as HTMLDivElement
    statusElementParent.dataset.gaClick =
      latestStatusElementParent.dataset.gaClick
    statusElementParent.setAttribute(
      "aria-label",
      latestStatusElementParent.getAttribute("aria-label")
    )
  }
}

function createNotificationsDropdown() {
  const indicators = $$("notification-indicator a")
  const participating = options.participating ? "participating" : ""

  for (const indicator of indicators) {
    // Close dropdown if a link is clicked
    // https://github.com/tanmayrajani/notifications-preview-github/issues/50
    const onClick = (event) => {
      if (
        !event.metaKey &&
        !event.ctrlKey &&
        !event.shiftKey &&
        event.target.closest("a[href]")
      ) {
        $(".modal-backdrop").click()
      }
    }

    indicator.parentElement.classList.add("position-relative")
    indicator.parentElement.prepend(
      <details
        className="NPG-container details-overlay details-reset"
        onClick={onClick}>
        <summary>
          <div className="NPG-opener js-menu-target" />
        </summary>
        {/* @ts-expect-error */}
        <details-menu
          className={`NPG-dropdown dropdown-menu dropdown-menu-sw notifications-list ${participating} type-${options.dropdown}`}
        />
      </details>
    )

    indicator.addEventListener("mouseenter", openDropdown)
    indicator.addEventListener("click", visitNotificationsPage)
  }
}

async function openDropdown({ currentTarget: indicator }) {
  const dropdown = indicator.parentNode
  indicator.classList.add("NPG-loading")
  const list = await notifications.getList()
  indicator.classList.remove("NPG-loading")

  if (!isOpen(dropdown) && list.length > 0) {
    const container = $(".NPG-dropdown", dropdown)
    empty(container)
    container.append(...list)

    delegate(
      ".NPG-dropdown button",
      "click",
      async (event) => {
        event.preventDefault()
        const button = event.delegateTarget
        const form = button.closest("form")
        const response = await pushForm(form)
        if (!response.ok) {
          throw new Error(response.statusText)
        }

        const notification = form.closest(".js-notifications-list-item")
        const group = form.closest(".js-notifications-group")
        const notifs = $$(".js-notifications-list-item", group)
        if (notification) {
          // Mark as read
          if (form.matches('[data-status="archived"]')) {
            notification.classList.replace(
              "notification-unread",
              "notification-read"
            )
            notification.remove()
          }

          // Remove group if last notification
          if ($$(".js-notifications-list-item", group).length === 0) {
            group.remove()
          }
        } else {
          form.classList.add("mark-all-as-read-confirmed")
          form.append(
            <label>&nbsp;Marked {notifs.length} notifications as read</label>
          )
          for (const item of $$(".js-notifications-list-item", group)) {
            item.remove()
          }
        }
      },
      {
        base: document
      }
    )

    // Improve style when they're grouped by repo
    container.classList.toggle(
      "npg-has-groups",
      elementExists(".js-notifications-group", container)
    )

    const wrap = (target, wrapper) => {
      target.before(wrapper)
      wrapper.append(target)
    }

    for (const header of $$(".js-notifications-group h6")) {
      wrap(
        header.firstChild,
        <a className="text-inherit" href={"/" + header.textContent.trim()} />
      )
    }

    $(".NPG-opener", dropdown).click() // Open modal
  }
}

// When the dropdown is open, GitHub's modal blocks all links outside the dropdown.
// This handler lets the user visit /notifications while retaining any cmd/ctrl click modifier
function visitNotificationsPage(event) {
  if (isOpen() && event.isTrusted) {
    event.currentTarget.dispatchEvent(new MouseEvent("click", event))
  }
}

async function updateLoop() {
  if (!isOpen()) {
    const latest = new Notifications()
    // On the first run, set it asap so they can be awaited
    if (!notifications) {
      notifications = latest
    }

    await latest.dom
    notifications = latest
    updateUnreadCount()
  }

  setTimeoutUntilVisible(updateLoop, 3000)
}

async function main() {
  options = await ExtensionOptions.getAll()
  await elementReady("notification-indicator")
  updateLoop()

  if (
    !location.pathname.startsWith("/notifications") &&
    options.dropdown !== "no"
  ) {
    createNotificationsDropdown()
  }
}

main()

export const config: PlasmoCSConfig = {
  run_at: "document_start",
  matches: ["https://github.com/*"]
}
