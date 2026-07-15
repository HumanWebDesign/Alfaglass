/* ================================================================
   ALFAGLASS | Interacciones accesibles y ciclo de vida controlado
   ================================================================ */

(() => {
  "use strict";

  const controller = new AbortController();
  const { signal } = controller;
  const observers = [];
  const timers = new Set();
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const later = (callback, delay) => {
    const timer = window.setTimeout(() => {
      timers.delete(timer);
      callback();
    }, delay);
    timers.add(timer);
    return timer;
  };

  const cancelLater = (timer) => {
    if (!timer) return;
    window.clearTimeout(timer);
    timers.delete(timer);
  };

  const listen = (target, event, handler, options = {}) => {
    if (!target) return;
    target.addEventListener(event, handler, { ...options, signal });
  };

  /* Encabezado y menú móvil */
  const header = document.querySelector(".site-header");
  const menuButton = document.querySelector(".menu-button");
  const mobileMenu = document.querySelector(".mobile-menu");

  const closeMenu = ({ restoreFocus = false } = {}) => {
    if (!menuButton || !mobileMenu) return;
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "Abrir menú");
    mobileMenu.setAttribute("aria-hidden", "true");
    mobileMenu.classList.remove("is-open");
    menuButton.querySelector("i")?.classList.replace("ph-x", "ph-list");
    if (restoreFocus) menuButton.focus();
  };

  listen(menuButton, "click", () => {
    const opening = menuButton.getAttribute("aria-expanded") !== "true";
    menuButton.setAttribute("aria-expanded", String(opening));
    menuButton.setAttribute("aria-label", opening ? "Cerrar menú" : "Abrir menú");
    mobileMenu.setAttribute("aria-hidden", String(!opening));
    mobileMenu.classList.toggle("is-open", opening);
    const icon = menuButton.querySelector("i");
    icon?.classList.toggle("ph-list", !opening);
    icon?.classList.toggle("ph-x", opening);
  });

  mobileMenu?.querySelectorAll("a").forEach((link) => listen(link, "click", closeMenu));

  listen(window, "scroll", () => header?.classList.toggle("is-scrolled", window.scrollY > 18), { passive: true });
  listen(window, "resize", () => {
    if (window.innerWidth > 900) closeMenu();
  }, { passive: true });

  /* Aparición progresiva y navegación activa */
  const revealItems = document.querySelectorAll(".reveal");
  if (reduceMotion || !("IntersectionObserver" in window)) {
    revealItems.forEach((item) => item.classList.add("is-visible"));
  } else {
    const revealObserver = new IntersectionObserver((entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8%", threshold: 0.08 });
    revealItems.forEach((item) => revealObserver.observe(item));
    observers.push(revealObserver);
  }

  const sectionLinks = [...document.querySelectorAll('.desktop-nav a[href^="#"]')];
  if ("IntersectionObserver" in window && sectionLinks.length) {
    const sectionObserver = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      sectionLinks.forEach((link) => {
        const active = link.getAttribute("href") === `#${visible.target.id}`;
        link.classList.toggle("is-active", active);
        if (active) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
      });
    }, { rootMargin: "-35% 0px -55%", threshold: [0, 0.15, 0.45] });
    document.querySelectorAll("main section[id]").forEach((section) => sectionObserver.observe(section));
    observers.push(sectionObserver);
  }

  /* Fondo ambiental opcional */
  if (!reduceMotion && window.particlesJS && document.getElementById("ambient-particles")) {
    window.particlesJS("ambient-particles", {
      particles: {
        number: { value: 24, density: { enable: true, value_area: 1100 } },
        color: { value: ["#0081b4", "#9eb8c2"] },
        shape: { type: "circle" },
        opacity: { value: 0.16, random: true },
        size: { value: 2.3, random: true },
        line_linked: { enable: true, distance: 170, color: "#7eb2c5", opacity: 0.1, width: 1 },
        move: { enable: true, speed: 0.35, direction: "none", random: true, straight: false, out_mode: "out" }
      },
      interactivity: { detect_on: "canvas", events: { onhover: { enable: false }, onclick: { enable: false }, resize: true } },
      retina_detect: true
    });
  }

  /* Imágenes: finaliza el skeleton al cargar o decodificar */
  const settleMedia = (image) => image.closest(".media-shell")?.classList.remove("is-loading");
  document.querySelectorAll(".media-shell img").forEach((image) => {
    if (image.complete && image.naturalWidth) {
      image.decode?.().catch(() => {}).finally(() => settleMedia(image));
    } else {
      listen(image, "load", () => settleMedia(image), { once: true });
      listen(image, "error", () => settleMedia(image), { once: true });
    }
  });

  /* Carrusel principal sin clones ni gesto de arrastre */
  const carousel = document.getElementById("projects-carousel");
  const track = document.getElementById("projects-track");
  const slides = track ? [...track.querySelectorAll(".project-slide")] : [];
  const previousButton = carousel?.querySelector(".project-main-prev");
  const nextButton = carousel?.querySelector(".project-main-next");
  const progress = carousel?.querySelector(".project-progress span");
  const carouselStatus = document.getElementById("project-carousel-status");
  let activeProject = 0;
  let carouselMoving = false;
  let autoplayTimer = null;
  const pauseReasons = new Set();
  const slideSlots = new Map();
  /* Mantiene tres tarjetas hasta tablet horizontal para evitar el salto a 901 px. */
  const projectBreakpoint = window.matchMedia("(max-width: 1023px)");

  const visibleProjectCount = () => (projectBreakpoint.matches ? 3 : 5);
  const projectStep = () => (projectBreakpoint.matches ? 68 : 25.5);

  const projectName = (index) => slides[index]?.querySelector("h3")?.textContent?.trim() || `Proyecto ${index + 1}`;

  const normalizedSlot = (index) => {
    let slot = (index - activeProject + slides.length) % slides.length;
    if (slot > Math.floor(slides.length / 2)) slot -= slides.length;
    return slot;
  };

  const applySlidePosition = (slide, index, slot) => {
    const visibleLimit = Math.floor(Math.min(visibleProjectCount(), slides.length) / 2);
    const distance = Math.abs(slot);
    slide.style.setProperty("--slide-left", `${50 + slot * projectStep()}%`);
    slide.classList.toggle("is-active", distance === 0);
    slide.classList.toggle("is-near", distance === 1);
    slide.classList.toggle("is-outside", distance > visibleLimit);
    slide.setAttribute("aria-hidden", String(distance !== 0));
    const trigger = slide.querySelector(".project-card-trigger");
    if (trigger) trigger.tabIndex = distance === 0 ? 0 : -1;
    slideSlots.set(index, slot);
  };

  /* Mantiene las flechas simétricas en las brechas de la tarjeta central. */
  const positionProjectControls = () => {
    const activeSlide = slides[activeProject];
    if (!carousel || !track || !activeSlide || !previousButton || !nextButton) return;
    const carouselStyle = getComputedStyle(carousel);
    const activeScale = Number.parseFloat(carouselStyle.getPropertyValue("--project-active-scale")) || 1.2;
    const arrowSize = previousButton.offsetWidth || 46;
    const arrowGap = projectBreakpoint.matches ? 7 : 14;
    const carouselWidth = carousel.clientWidth;
    const activeVisualWidth = activeSlide.offsetWidth * activeScale;
    const centerX = carouselWidth / 2;
    const minimumX = 6;
    const maximumX = Math.max(minimumX, carouselWidth - arrowSize - 6);
    const previousX = Math.min(maximumX, Math.max(minimumX, centerX - activeVisualWidth / 2 - arrowGap - arrowSize));
    const nextX = Math.min(maximumX, Math.max(minimumX, centerX + activeVisualWidth / 2 + arrowGap));
    const centerY = track.offsetTop + track.offsetHeight / 2;
    carousel.style.setProperty("--project-prev-x", `${previousX}px`);
    carousel.style.setProperty("--project-next-x", `${nextX}px`);
    carousel.style.setProperty("--project-arrow-y", `${centerY}px`);
  };

  const positionSlides = ({ announce = false, animate = true } = {}) => {
    if (!track || !slides.length) return;
    const nextSlots = slides.map((_, index) => normalizedSlot(index));
    const wrapping = [];

    slides.forEach((slide, index) => {
      const oldSlot = slideSlots.get(index);
      const nextSlot = nextSlots[index];
      if (animate && oldSlot !== undefined && Math.abs(nextSlot - oldSlot) > 1) {
        slide.classList.add("is-wrapping");
        wrapping.push({ slide, index, slot: nextSlot });
        return;
      }
      if (!animate) slide.classList.add("no-motion");
      applySlidePosition(slide, index, nextSlot);
    });

    if (wrapping.length) {
      later(() => {
        wrapping.forEach(({ slide, index, slot }) => {
          slide.classList.add("no-motion");
          applySlidePosition(slide, index, slot);
        });
        requestAnimationFrame(() => requestAnimationFrame(() => {
          wrapping.forEach(({ slide }) => slide.classList.remove("no-motion", "is-wrapping"));
        }));
      }, 150);
    }

    if (!animate) {
      requestAnimationFrame(() => slides.forEach((slide) => slide.classList.remove("no-motion")));
    }

    if (progress) progress.style.transform = `translate3d(${activeProject * 100}%, 0, 0)`;
    if (announce && carouselStatus) {
      carouselStatus.textContent = `Proyecto ${activeProject + 1} de ${slides.length}: ${projectName(activeProject)}`;
    }
    requestAnimationFrame(positionProjectControls);
  };

  const clearAutoplay = () => {
    cancelLater(autoplayTimer);
    autoplayTimer = null;
  };

  const scheduleAutoplay = () => {
    clearAutoplay();
    if (pauseReasons.size || reduceMotion || !slides.length) return;
    autoplayTimer = later(() => moveProject(1, { announce: false }), 4800);
  };

  const moveProject = (direction, { announce = true } = {}) => {
    if (!track || carouselMoving || slides.length < 2) return;
    carouselMoving = true;
    clearAutoplay();
    activeProject = (activeProject + direction + slides.length) % slides.length;
    positionSlides({ announce, animate: true });
    later(() => {
      carouselMoving = false;
      scheduleAutoplay();
    }, 640);
  };

  positionSlides({ animate: false });
  scheduleAutoplay();

  listen(previousButton, "click", () => moveProject(-1));
  listen(nextButton, "click", () => moveProject(1));

  listen(carousel, "mouseenter", () => {
    pauseReasons.add("hover");
    clearAutoplay();
  });
  listen(carousel, "mouseleave", () => {
    pauseReasons.delete("hover");
    scheduleAutoplay();
  });
  listen(carousel, "focusin", () => {
    pauseReasons.add("focus");
    clearAutoplay();
  });
  listen(carousel, "focusout", (event) => {
    if (carousel.contains(event.relatedTarget)) return;
    pauseReasons.delete("focus");
    scheduleAutoplay();
  });
  listen(carousel, "keydown", (event) => {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveProject(-1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveProject(1);
    }
  });

  listen(projectBreakpoint, "change", () => positionSlides({ animate: false }));

  if (carousel && "ResizeObserver" in window) {
    const projectControlsObserver = new ResizeObserver(() => requestAnimationFrame(positionProjectControls));
    projectControlsObserver.observe(carousel);
    projectControlsObserver.observe(track);
    observers.push(projectControlsObserver);
  }

  /* Galería en dialog nativo */
  const modal = document.getElementById("project-modal");
  const modalDialog = modal?.querySelector(".project-modal-dialog");
  const modalMedia = modal?.querySelector(".project-modal-media");
  const modalImage = document.getElementById("project-modal-image");
  const modalAvif = document.getElementById("project-modal-avif");
  const modalWebp = document.getElementById("project-modal-webp");
  const modalTitle = document.getElementById("project-modal-title");
  const modalCategory = document.getElementById("project-modal-category");
  const modalCount = document.getElementById("project-modal-count");
  let projectData = [];
  let modalProject = 0;
  let modalImageIndex = 0;
  let modalLoadToken = 0;
  let previousFocus = null;

  try {
    projectData = JSON.parse(document.getElementById("project-data")?.textContent || "[]");
  } catch {
    projectData = [];
  }

  const renderModalImage = () => {
    const project = projectData[modalProject];
    const image = project?.images?.[modalImageIndex];
    if (!project || !image || !modalImage) return;
    const token = ++modalLoadToken;
    modalMedia?.classList.add("is-loading");
    modalMedia?.setAttribute("aria-busy", "true");
    modalImage.alt = image.alt;
    if (modalAvif) modalAvif.srcset = `${image.base}-480.avif 480w, ${image.base}-960.avif 960w`;
    if (modalWebp) modalWebp.srcset = `${image.base}-480.webp 480w, ${image.base}-960.webp 960w`;
    modalImage.src = image.src;
    if (modalTitle) modalTitle.textContent = project.title;
    if (modalCategory) modalCategory.textContent = project.category;
    if (modalCount) modalCount.textContent = `${modalImageIndex + 1} / ${project.images.length}`;

    const finish = () => {
      if (token !== modalLoadToken) return;
      modalMedia?.classList.remove("is-loading");
      modalMedia?.setAttribute("aria-busy", "false");
    };
    if (modalImage.complete && modalImage.naturalWidth) modalImage.decode?.().catch(() => {}).finally(finish);
    else {
      modalImage.addEventListener("load", finish, { once: true, signal });
      modalImage.addEventListener("error", finish, { once: true, signal });
    }
  };

  const changeModalImage = (direction) => {
    const count = projectData[modalProject]?.images?.length || 0;
    if (!count) return;
    modalImageIndex = (modalImageIndex + direction + count) % count;
    renderModalImage();
  };

  const openProject = (index, trigger) => {
    if (!modal || !projectData[index] || typeof modal.showModal !== "function") return;
    previousFocus = trigger || document.activeElement;
    modalProject = index;
    modalImageIndex = 0;
    renderModalImage();
    pauseReasons.add("modal");
    clearAutoplay();
    modal.showModal();
    document.body.classList.add("modal-open");
    modal.querySelector(".project-modal-close")?.focus();
  };

  listen(carousel, "click", (event) => {
    const trigger = event.target.closest("[data-project-open]");
    if (!trigger) return;
    openProject(Number(trigger.dataset.projectOpen), trigger);
  });

  listen(modal, "click", (event) => {
    const action = event.target.closest("[data-modal-action]")?.dataset.modalAction;
    if (action === "close") modal.close();
    if (action === "previous") changeModalImage(-1);
    if (action === "next") changeModalImage(1);
    if (event.target === modal) modal.close();
  });

  listen(modal, "keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      modal.close();
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      changeModalImage(-1);
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      changeModalImage(1);
    }
  });

  listen(modal, "close", () => {
    /* Un solo flujo cubre boton, backdrop, Escape y cierres programaticos. */
    document.body.classList.remove("modal-open");
    pauseReasons.delete("modal");
    scheduleAutoplay();
    if (previousFocus instanceof HTMLElement && document.contains(previousFocus)) previousFocus.focus();
    previousFocus = null;
  });

  /* Acordeón accesible con transición de cortina */
  document.querySelectorAll(".faq-item h3 button").forEach((button) => {
    const answer = document.getElementById(button.getAttribute("aria-controls"));
    if (!answer) return;
    listen(button, "click", () => {
      const opening = button.getAttribute("aria-expanded") !== "true";
      button.setAttribute("aria-expanded", String(opening));
      if (opening) {
        answer.hidden = false;
        answer.style.maxHeight = "0px";
        answer.style.opacity = "0";
        requestAnimationFrame(() => {
          answer.style.maxHeight = `${answer.scrollHeight}px`;
          answer.style.opacity = "1";
        });
      } else {
        answer.style.maxHeight = `${answer.scrollHeight}px`;
        requestAnimationFrame(() => {
          answer.style.maxHeight = "0px";
          answer.style.opacity = "0";
        });
        later(() => {
          if (button.getAttribute("aria-expanded") === "false") answer.hidden = true;
        }, 310);
      }
    });
  });

  /* Formulario con validación progresiva y envío asíncrono */
  const form = document.getElementById("contact-form");
  const formStatus = document.getElementById("contact-status");
  const fields = form ? [...form.querySelectorAll("input, select, textarea")].filter((field) => field.type !== "submit") : [];
  const touched = new WeakSet();

  const fieldContainer = (field) => field.closest(".form-field, .consent-field");
  const fieldError = (field) => document.getElementById(`${field.id}-error`);

  const errorMessage = (field) => {
    const value = typeof field.value === "string" ? field.value.trim() : "";
    if (field.type === "checkbox" && !field.checked) return "Debes aceptar las condiciones para continuar.";
    if (field.required && !value) return field.tagName === "SELECT" ? "Selecciona un tipo de servicio." : "Este campo es obligatorio.";
    if (field.id === "contact-name" && value.length < 2) return "Ingresa al menos 2 caracteres.";
    if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(value)) return "Ingresa un correo válido, por ejemplo nombre@dominio.cl.";
    if (field.type === "tel" && !/^\+56\s?9\s?\d{4}\s?\d{4}$/.test(value)) return "Usa un número móvil chileno con el formato +56 9 1234 5678.";
    return "";
  };

  const validateField = (field, { force = false } = {}) => {
    const message = errorMessage(field);
    const show = force || touched.has(field);
    const container = fieldContainer(field);
    const error = fieldError(field);
    field.setAttribute("aria-invalid", String(Boolean(message)));
    container?.classList.toggle("is-invalid", show && Boolean(message));
    container?.classList.toggle("is-valid", show && !message);
    if (error) {
      error.textContent = show ? message : "";
      error.hidden = !show || !message;
    }
    return !message;
  };

  const setStatus = (message, type) => {
    if (!formStatus) return;
    formStatus.textContent = message;
    formStatus.className = `contact-status is-${type}`;
    formStatus.hidden = false;
  };

  const clearStatus = () => {
    if (!formStatus) return;
    formStatus.hidden = true;
    formStatus.textContent = "";
    formStatus.className = "contact-status";
  };

  const setSubmitting = (submitting) => {
    if (!form) return;
    form.setAttribute("aria-busy", String(submitting));
    form.querySelectorAll("input, select, textarea, button").forEach((control) => {
      control.disabled = submitting;
    });
    const label = form.querySelector(".button-label");
    if (label) label.textContent = submitting ? "ENVIANDO" : "ENVIAR MENSAJE";
  };

  fields.forEach((field) => {
    listen(field, "blur", () => {
      touched.add(field);
      validateField(field);
    });
    listen(field, field.type === "checkbox" || field.tagName === "SELECT" ? "change" : "input", () => {
      clearStatus();
      if (touched.has(field)) validateField(field);
    });
  });

  listen(form, "submit", async (event) => {
    event.preventDefault();
    clearStatus();
    fields.forEach((field) => touched.add(field));
    const valid = fields.map((field) => validateField(field, { force: true })).every(Boolean);
    if (!valid) {
      const firstInvalid = fields.find((field) => field.getAttribute("aria-invalid") === "true");
      setStatus("Revisa los campos marcados antes de enviar.", "error");
      firstInvalid?.focus();
      return;
    }

    const endpoint = form.dataset.endpoint?.trim();
    if (!endpoint || !/^https:\/\/formspree\.io\/f\/[a-z0-9]+$/i.test(endpoint)) {
      setStatus("El formulario aún no tiene configurado su destino de envío. Puedes contactarnos mediante el botón de WhatsApp.", "error");
      return;
    }

    const payload = new FormData(form);
    setSubmitting(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        body: payload,
        headers: { Accept: "application/json" },
        signal
      });
      if (!response.ok) throw new Error("No fue posible procesar el formulario.");
      form.reset();
      fields.forEach((field) => {
        field.removeAttribute("aria-invalid");
        fieldContainer(field)?.classList.remove("is-valid", "is-invalid");
        const error = fieldError(field);
        if (error) error.hidden = true;
      });
      setStatus("Mensaje enviado correctamente. Nuestro equipo se pondrá en contacto contigo.", "success");
    } catch (error) {
      if (error.name !== "AbortError") setStatus("No pudimos enviar el mensaje. Intenta nuevamente o escríbenos por WhatsApp.", "error");
    } finally {
      if (!signal.aborted) setSubmitting(false);
    }
  });

  /* Cierre ordenado: listeners, observadores y temporizadores */
  listen(window, "pagehide", () => {
    observers.forEach((observer) => observer.disconnect());
    timers.forEach((timer) => window.clearTimeout(timer));
    timers.clear();
    controller.abort();
  }, { once: true });
})();
