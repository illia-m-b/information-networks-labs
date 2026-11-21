const ALLOWED_ALERT_TYPES = new Set([
  "primary",
  "secondary",
  "success",
  "danger",
  "warning",
  "info",
  "light",
  "dark",
]);

window.Alert = {
  append(container, message, type = "info") {
    container.replaceChildren();

    const safeType = ALLOWED_ALERT_TYPES.has(type) ? type : "info";
    const wrapper = document.createElement("div");
    const alert = document.createElement("div");
    alert.className = `alert alert-${safeType} alert-dismissible`;
    alert.setAttribute("role", "alert");

    const body = document.createElement("div");
    body.textContent = String(message ?? "");

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "btn-close";
    closeBtn.setAttribute("data-bs-dismiss", "alert");
    closeBtn.setAttribute("aria-label", "Close");

    alert.append(body, closeBtn);
    wrapper.append(alert);
    container.append(wrapper);
  },

  appendValidationErrors(container, errors, title = "Please fix the following:") {
    container.replaceChildren();

    const wrapper = document.createElement("div");
    const alert = document.createElement("div");
    alert.className = "alert alert-danger";
    alert.setAttribute("role", "alert");

    const titleEl = document.createElement("div");
    titleEl.textContent = title;
    alert.appendChild(titleEl);

    const list = document.createElement("ul");
    list.className = "mb-0 mt-2";

    (Array.isArray(errors) ? errors : []).forEach((e) => {
      const li = document.createElement("li");

      const strong = document.createElement("strong");
      strong.textContent = `${e?.field ?? "field"}: `;
      li.appendChild(strong);

      li.appendChild(document.createTextNode(String(e?.message ?? "")));
      list.appendChild(li);
    });

    alert.appendChild(list);
    wrapper.appendChild(alert);
    container.append(wrapper);
  },

  appendApiError(container, error, fallbackMessage = "An error occurred") {
    if (error?.errors && Array.isArray(error.errors) && error.errors.length > 0) {
      this.appendValidationErrors(container, error.errors);
      return;
    }

    this.append(container, error?.message || fallbackMessage, "danger");
  },
};
