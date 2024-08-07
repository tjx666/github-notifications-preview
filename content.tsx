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

function toggleNotificationsIndicator(show: boolean) {
  $("#AppHeader-notifications-button").style.setProperty(
    "--notifications-icon-indicator-display",
    show ? "block" : "none"
  )
}

function hidePreview() {
  $(".NPG-container summary").click()
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
  toggleNotificationsIndicator(Number(latestCount) + rghCount > 0)

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
    const dropdownHeader = (
      <div
        style={{
          backgroundColor: "var(--bgColor-muted, var(--color-canvas-subtle))"
        }}>
        <div
          style={{
            cursor: "pointer",
            width: "fit-content",
            marginLeft: "auto",
            padding: "4px 10px",
            color: "var(--fgColor-accent, var(--color-accent-fg))"
          }}
          onClick={() => {
            for (const form of $$(
              ".NPG-dropdown .js-notifications-list-item form[action='/notifications/beta/archive']"
            )) {
              ;(
                form.querySelector("button[type=submit]") as HTMLButtonElement
              ).click()
            }
          }}>
          <svg
            className="octicon octicon-checklist"
            xmlns="http://www.w3.org/2000/svg"
            width={16}
            height={16}
            viewBox="0 0 16 16"
            role="img"
            aria-hidden="true">
            <path d="M2.5 1.75v11.5c0 .138.112.25.25.25h3.17a.75.75 0 0 1 0 1.5H2.75A1.75 1.75 0 0 1 1 13.25V1.75C1 .784 1.784 0 2.75 0h8.5C12.216 0 13 .784 13 1.75v7.736a.75.75 0 0 1-1.5 0V1.75a.25.25 0 0 0-.25-.25h-8.5a.25.25 0 0 0-.25.25Zm13.274 9.537v-.001l-4.557 4.45a.75.75 0 0 1-1.055-.008l-1.943-1.95a.75.75 0 0 1 1.062-1.058l1.419 1.425 4.026-3.932a.75.75 0 1 1 1.048 1.074ZM4.75 4h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5ZM4 7.75A.75.75 0 0 1 4.75 7h2a.75.75 0 0 1 0 1.5h-2A.75.75 0 0 1 4 7.75Z" />
          </svg>
          &nbsp;&nbsp;
          <span>Mark all as read</span>
        </div>
      </div>
    )
    container.append(dropdownHeader)
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

        const notificationItem = form.closest(".js-notifications-list-item")
        const notificationGroup = form.closest(".js-notifications-group")
        const notificationItemOperations = $$(
          ".js-notifications-list-item",
          notificationGroup
        )
        if (notificationItem) {
          // Mark as read
          if (form.matches('[data-status="archived"]')) {
            notificationItem.classList.replace(
              "notification-unread",
              "notification-read"
            )
            notificationItem.remove()
          }

          // Remove group if last notification
          if (
            $$(".js-notifications-list-item", notificationGroup).length === 0
          ) {
            notificationGroup?.remove()
          }
        } else {
          form.classList.add("mark-all-as-read-confirmed")
          form.append(
            <label>
              &nbsp;Marked {notificationItemOperations.length} notifications as
              read
            </label>
          )
          for (const item of $$(
            ".js-notifications-list-item",
            notificationGroup
          )) {
            item.remove()
          }
        }

        // all notifications are read, remove the header
        if (
          $$(".js-notifications-list-item, .js-notifications-group").length ===
          0
        ) {
          dropdownHeader.remove()
          toggleNotificationsIndicator(false)
          hidePreview()
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
