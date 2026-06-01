/* ==========================================================================
   REFLEXCAM - LÓGICA DE NEGOCIO, ANIMACIONES Y CALENDARIO INTERACTIVO
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    
    // --- ESTADO GLOBAL DE LA APLICACIÓN ---
    const AppState = {
        soundEnabled: true,
        activePage: 'inicio',
        // Datos de Citas
        selectedPackage: 'corporativo',
        selectedPackagePrice: 350000,
        selectedPackageName: 'Retrato Corporativo',
        selectedPackageDuration: 3,
        rawStartTime: null,
        selectedDate: null, // Objeto Date seleccionado
        selectedTime: null,
        selectedLocation: {
            address: '',
            lat: null,
            lng: null,
            googleMapsUrl: ''
        },
        hasOverlapWarning: false,
        // Calendario
        currentCalendarYear: new Date().getFullYear(),
        currentCalendarMonth: new Date().getMonth(), // 0-indexed
        bookings: JSON.parse(localStorage.getItem('reflexcam_bookings')) || [],
        spreadsheetBookings: []
    };

    // Nombres de meses en español
    const MONTH_NAMES = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    // --- ELEMENTOS DEL DOM ---
    const DOM = {
        // Enrutamiento SPA
        navLinks: document.querySelectorAll('.nav-menu .nav-link'),
        logoLink: document.getElementById('logo-link'),
        headerCta: document.getElementById('header-cta'),
        pages: {
            inicio: document.getElementById('page-inicio'),
            reservas: document.getElementById('page-reservas')
        },
        header: document.querySelector('.glass-header'),
        soundToggle: document.getElementById('sound-toggle'),
        soundIconOn: document.querySelector('.sound-icon-on'),
        soundIconOff: document.querySelector('.sound-icon-off'),

        // Efectos Visuales
        flashOverlay: document.getElementById('camera-flash'),

        // Hero Scroll Showcase
        scrollContainer: document.querySelector('.scroll-container'),
        galleryImages: document.querySelectorAll('.gallery-image'),
        textSlides: document.querySelectorAll('.text-slide'),
        progressBar: document.getElementById('scroll-progress-bar'),
        hudFocus: document.getElementById('hud-focus'),
        // HUD params
        hudSS: document.getElementById('hud-ss'),
        hudAperture: document.getElementById('hud-aperture'),
        hudEV: document.getElementById('hud-ev'),
        hudISO: document.getElementById('hud-iso'),

        // Reservas - Paquetes
        packageCards: document.querySelectorAll('.package-card'),
        summaryInput: document.getElementById('selected-summary'),

        // Reservas - Calendario
        calendarMonthYear: document.getElementById('calendar-month-year'),
        calendarDaysGrid: document.getElementById('calendar-days'),
        prevMonthBtn: document.getElementById('prev-month'),
        nextMonthBtn: document.getElementById('next-month'),
        
        // Reservas - Horarios
        timeSlotsGrid: document.getElementById('time-slots-grid'),
        timeWarningMsg: document.getElementById('time-warning-msg'),
        timeSlots: document.querySelectorAll('.time-slot'),

        // Reservas - Formulario
        bookingForm: document.getElementById('booking-form'),
        clientNameInput: document.getElementById('client-name'),
        clientEmailInput: document.getElementById('client-email'),
        clientPhoneInput: document.getElementById('client-phone'),
        clientNotesInput: document.getElementById('client-notes'),
        confirmBtn: document.getElementById('confirm-booking-btn'),
        locationSearchInput: document.getElementById('location-search-input'),
        locationSearchBtn: document.getElementById('location-search-btn'),
        locAddressText: document.getElementById('loc-address-text'),
        locResolvedInfo: document.getElementById('location-resolved-info'),
        latitudeInput: document.getElementById('latitude-input'),
        longitudeInput: document.getElementById('longitude-input'),

        // Modal de Confirmación
        modal: document.getElementById('confirmation-modal'),
        closeModalBtn: document.getElementById('close-modal-btn'),
        ticketClientName: document.getElementById('ticket-client-name'),
        ticketService: document.getElementById('ticket-service'),
        ticketDate: document.getElementById('ticket-date'),
        ticketTime: document.getElementById('ticket-time'),
        ticketPrice: document.getElementById('ticket-price'),
        ticketBookingId: document.getElementById('ticket-booking-id'),
        ticketLocation: document.getElementById('ticket-location')
    };

    /* ==========================================================================
       1. ENRUTADOR SPA CON TRANSICIONES SUAVES
       ========================================================================== */
    function navigateTo(pageId) {
        if (!DOM.pages[pageId]) return;

        // Reproducir sonido sutil de transición
        playTransitionClick();

        // Actualizar links en la navegación
        DOM.navLinks.forEach(link => {
            if (link.getAttribute('data-target') === pageId) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });

        // Apagar todas las páginas con animación
        Object.keys(DOM.pages).forEach(key => {
            const page = DOM.pages[key];
            if (key === pageId) {
                page.style.display = 'block';
                // Trigger reflow para asegurar animación de entrada
                page.offsetHeight;
                page.classList.add('active');
            } else {
                page.classList.remove('active');
                // Retrasar el display none para permitir que termine la animación
                setTimeout(() => {
                    if (!page.classList.contains('active')) {
                        page.style.display = 'none';
                    }
                }, 600);
            }
        });

        AppState.activePage = pageId;

        // Si entramos a reservas, asegurar la inicialización del mapa o su recálculo de tamaño
        if (pageId === 'reservas') {
            setTimeout(() => {
                if (!locationMap) {
                    initLocationMap();
                } else {
                    locationMap.invalidateSize();
                }
            }, 100);
        }

        // Scroll al inicio de la página en la vista de reservas
        if (pageId === 'reservas') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    // Configurar listeners para la navegación
    DOM.navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const target = link.getAttribute('data-target');
            navigateTo(target);
        });
    });

    DOM.logoLink.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo('inicio');
    });

    DOM.headerCta.addEventListener('click', (e) => {
        e.preventDefault();
        navigateTo('reservas');
    });

    // Registrar navegacion en botones internos de diapositivas
    document.querySelectorAll('.slide-cta-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            navigateTo('reservas');
        });
    });

    // Cambiar la cabecera al hacer scroll
    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            DOM.header.classList.add('scrolled');
        } else {
            DOM.header.classList.remove('scrolled');
        }
    });


    /* ==========================================================================
       2. EFECTO SONORO DE OBTURADOR REALISTA (WEB AUDIO API)
       ========================================================================== */
    // Generación procedural de un sonido de obturador de cámara reflex
    function playCameraShutterSound() {
        if (!AppState.soundEnabled) return;

        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();

            // 1. Crear un buffer de ruido blanco para el sonido del obturador mecánico
            const bufferSize = ctx.sampleRate * 0.35; // 350ms de sonido
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }

            const noiseNode = ctx.createBufferSource();
            noiseNode.buffer = buffer;

            // 2. Filtro de paso de banda para dar una acústica metálica de cámara reflex
            const filter = ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.value = 1000;
            filter.Q.value = 1.8;

            // 3. Envoltura de volumen (Gain Envelope) para el sonido doble del obturador (apertura + cierre)
            const gainNode = ctx.createGain();
            const now = ctx.currentTime;
            
            // Sonido 1: Apertura instantánea del obturador (Snap inicial rápido)
            gainNode.gain.setValueAtTime(0.001, now);
            gainNode.gain.linearRampToValueAtTime(0.9, now + 0.005);
            gainNode.gain.exponentialRampToValueAtTime(0.15, now + 0.04);
            
            // Transición del espejo levantándose
            gainNode.gain.linearRampToValueAtTime(0.04, now + 0.08);

            // Sonido 2: Cierre mecánico del obturador
            gainNode.gain.linearRampToValueAtTime(0.65, now + 0.12);
            gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

            // Conectar nodos
            noiseNode.connect(filter);
            filter.connect(gainNode);
            gainNode.connect(ctx.destination);

            // Iniciar y detener
            noiseNode.start(now);
            noiseNode.stop(now + 0.35);

        } catch (e) {
            console.warn('Web Audio no soportado o bloqueado por el navegador.', e);
        }
    }

    // Efecto de sonido corto para los clicks ordinarios de navegación
    function playTransitionClick() {
        if (!AppState.soundEnabled) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1200, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.08);
            
            gain.gain.setValueAtTime(0.05, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.start();
            osc.stop(ctx.currentTime + 0.08);
        } catch(e) {}
    }

    // Control de silencio / efectos de sonido
    DOM.soundToggle.addEventListener('click', () => {
        AppState.soundEnabled = !AppState.soundEnabled;
        if (AppState.soundEnabled) {
            DOM.soundIconOn.classList.remove('hidden');
            DOM.soundIconOff.classList.add('hidden');
            playTransitionClick();
        } else {
            DOM.soundIconOn.classList.add('hidden');
            DOM.soundIconOff.classList.remove('hidden');
        }
    });


    /* ==========================================================================
       3. MOTOR DE ANIMACIÓN POR SCROLL (HERO REFLEX SHOWCASE)
       ========================================================================== */
    let lastScrollPercent = -1;
    let focusLockTriggered = [false, false, false, false];

    function updateHeroScrollAnimation() {
        if (AppState.activePage !== 'inicio') return;

        const containerRect = DOM.scrollContainer.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const totalHeight = DOM.scrollContainer.offsetHeight;

        // Calcular el porcentaje exacto de scroll de la sección (de 0 a 1)
        const scrollRange = totalHeight - viewportHeight;
        const scrolled = -containerRect.top;
        let scrollPercent = scrolled / scrollRange;
        scrollPercent = Math.min(Math.max(scrollPercent, 0), 1);

        // Si no ha cambiado el scroll, omitir cálculos pesados
        if (scrollPercent === lastScrollPercent) return;
        lastScrollPercent = scrollPercent;

        // 1. Actualizar barra de progreso inferior del HUD
        DOM.progressBar.style.width = `${scrollPercent * 100}%`;

        // 2. Determinar qué diapositiva está activa
        // Dividimos el rango [0, 1] en 4 partes
        let activeIndex = 0;
        let slideProgress = 0; // Progreso dentro del slide actual (0 a 1)

        if (scrollPercent < 0.25) {
            activeIndex = 0;
            slideProgress = scrollPercent / 0.25;
        } else if (scrollPercent < 0.50) {
            activeIndex = 1;
            slideProgress = (scrollPercent - 0.25) / 0.25;
        } else if (scrollPercent < 0.75) {
            activeIndex = 2;
            slideProgress = (scrollPercent - 0.50) / 0.25;
        } else {
            activeIndex = 3;
            slideProgress = (scrollPercent - 0.75) / 0.25;
        }

        // 3. Transicionar imágenes con efecto de zoom y opacidad
        DOM.galleryImages.forEach((img, idx) => {
            if (idx === activeIndex) {
                img.classList.add('active');
                // Efecto de zoom dinámico continuo al deslizar
                // Zoom suave entre 1.05 y 1.20
                const currentScale = 1.05 + slideProgress * 0.15;
                img.style.transform = `scale(${currentScale})`;
            } else {
                img.classList.remove('active');
                img.style.transform = 'scale(1.2) rotate(0.5deg)';
            }
        });

        // 4. Transicionar textos informativos laterales
        DOM.textSlides.forEach((slide, idx) => {
            if (idx === activeIndex) {
                slide.classList.add('active');
            } else {
                slide.classList.remove('active');
            }
        });

        // 5. Simular Enfoque Automático (Autofocus-Lock) en momentos específicos del scroll
        // Bloqueo de enfoque a mitad de cada slide
        const isNearMidpoint = (slideProgress > 0.4 && slideProgress < 0.6);
        if (isNearMidpoint) {
            DOM.hudFocus.classList.add('focused');
            
            // Reproducir un doble pitido digital corto de "Focus Lock" si es la primera vez que entra en este slide
            if (!focusLockTriggered[activeIndex]) {
                triggerFocusBeepSound();
                focusLockTriggered[activeIndex] = true;
            }
        } else {
            DOM.hudFocus.classList.remove('focused');
            focusLockTriggered[activeIndex] = false;
        }

        // 6. Actualizar los parámetros de la cámara digital en el visor HUD
        updateDigitalHUDParams(activeIndex, slideProgress);
    }

    // Doble tono agudo de enfoque de cámara real
    function triggerFocusBeepSound() {
        if (!AppState.soundEnabled) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            
            const now = ctx.currentTime;
            
            // Tono 1
            const osc1 = ctx.createOscillator();
            const gain1 = ctx.createGain();
            osc1.type = 'sine';
            osc1.frequency.setValueAtTime(2000, now);
            gain1.gain.setValueAtTime(0.04, now);
            gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
            osc1.connect(gain1);
            gain1.connect(ctx.destination);
            osc1.start(now);
            osc1.stop(now + 0.06);

            // Tono 2 (ligeramente retrasado)
            const osc2 = ctx.createOscillator();
            const gain2 = ctx.createGain();
            osc2.type = 'sine';
            osc2.frequency.setValueAtTime(2000, now + 0.07);
            gain2.gain.setValueAtTime(0.04, now + 0.07);
            gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
            osc2.connect(gain2);
            gain2.connect(ctx.destination);
            osc2.start(now + 0.07);
            osc2.stop(now + 0.13);

        } catch(e) {}
    }

    // Actualizar texto del panel LCD de la cámara
    function updateDigitalHUDParams(slideIdx, progress) {
        // Configuraciones de cámara según el tipo de foto
        const presets = [
            { ss: '1/250s', av: 'F1.4', iso: '100', ev: '+0.3' }, // Estudio (Retrato)
            { ss: '1/800s', av: 'F2.8', iso: '400', ev: '0.0' },  // Exterior (Moda)
            { ss: '1/1600s', av: 'F4.0', iso: '800', ev: '-0.3' }, // Lente (Precisión)
            { ss: '1/500s', av: 'F2.0', iso: '200', ev: '+0.7' }   // Edición (Revelado)
        ];

        const preset = presets[slideIdx];
        DOM.hudSS.textContent = preset.ss;
        DOM.hudAperture.textContent = preset.av;
        DOM.hudISO.textContent = preset.iso;
        
        // Simular variación en el valor del exposímetro (EV) por el movimiento
        const dynamicEV = (parseFloat(preset.ev) + Math.sin(progress * Math.PI) * 0.2).toFixed(1);
        DOM.hudEV.textContent = dynamicEV >= 0 ? `+${dynamicEV}` : dynamicEV;
    }

    // Escuchador de scroll optimizado con requestAnimationFrame
    let isScrolling = false;
    window.addEventListener('scroll', () => {
        if (!isScrolling) {
            window.requestAnimationFrame(() => {
                updateHeroScrollAnimation();
                isScrolling = false;
            });
            isScrolling = true;
        }
    });

    // Inicializar HUD animado
    updateHeroScrollAnimation();


    /* ==========================================================================
       4. CONTROLADOR DEL FORMULARIO Y SELECCIÓN DE PAQUETES
       ========================================================================== */
    DOM.packageCards.forEach(card => {
        card.addEventListener('click', () => {
            // Quitar active de todas
            DOM.packageCards.forEach(c => c.classList.remove('active'));
            // Añadir a la seleccionada
            card.classList.add('active');

            // Actualizar estado global
            AppState.selectedPackage = card.getAttribute('data-package');
            AppState.selectedPackagePrice = parseInt(card.getAttribute('data-price'));
            AppState.selectedPackageName = card.querySelector('.package-name').textContent;

            // Mapear duraciones según el servicio seleccionado
            const packageDurations = {
                'corporativo': 3,
                'producto': 3,
                'video-redes': 5,
                'video-corp': 5,
                'publicitaria': 8
            };
            AppState.selectedPackageDuration = packageDurations[AppState.selectedPackage] || 3;

            // Re-evaluar las horas reservadas si ya se eligió un día
            if (AppState.selectedDate) {
                checkBookedSlotsForDate(AppState.selectedDate);
            }

            // Recalcular rango automáticamente si ya hay una hora de inicio seleccionada
            if (AppState.rawStartTime) {
                recalculateRangeFromStartTime(AppState.rawStartTime);
            } else {
                updateFormSummary();
            }
            
            playTransitionClick();
        });
    });

    function updateFormSummary() {
        if (AppState.selectedDate && AppState.selectedTime) {
            const formattedDate = formatDateString(AppState.selectedDate);
            DOM.summaryInput.value = `${AppState.selectedPackageName} — ${formattedDate} a las ${AppState.selectedTime}`;
        } else {
            DOM.summaryInput.value = `${AppState.selectedPackageName} — Selecciona fecha y hora`;
        }
        validateFormCompleteness();
    }


    /* ==========================================================================
       5. SISTEMA DE CALENDARIO INTERACTIVO ULTRA COMPLETO
       ========================================================================== */
    function renderCalendar() {
        const year = AppState.currentCalendarYear;
        const month = AppState.currentCalendarMonth;

        // Actualizar título de mes y año
        DOM.calendarMonthYear.textContent = `${MONTH_NAMES[month]} ${year}`;

        // Obtener primer día de la semana del mes (ajustado de Domingo 0 a Lunes 0 o mantener estándar de grid)
        // Date(year, month, 1).getDay() nos da 0 para Domingo, 1 para Lunes, etc.
        const firstDayIndex = new Date(year, month, 1).getDay();

        // Obtener total de días del mes actual
        const totalDays = new Date(year, month + 1, 0).getDate();

        // Vaciar contenedor de días
        DOM.calendarDaysGrid.innerHTML = '';

        // Rellenar días vacíos para el offset de inicio del mes
        for (let i = 0; i < firstDayIndex; i++) {
            const emptyCell = document.createElement('div');
            emptyCell.classList.add('calendar-day-cell', 'disabled');
            DOM.calendarDaysGrid.appendChild(emptyCell);
        }

        const today = new Date();
        today.setHours(0,0,0,0);

        // Crear las celdas para cada día
        for (let day = 1; day <= totalDays; day++) {
            const cell = document.createElement('div');
            cell.classList.add('calendar-day-cell');
            cell.textContent = day;

            const cellDate = new Date(year, month, day);
            cellDate.setHours(0,0,0,0);

            // 1. Resaltar el día de hoy
            if (cellDate.getTime() === today.getTime()) {
                cell.classList.add('today');
            }

            // 2. Deshabilitar fechas pasadas
            if (cellDate < today) {
                cell.classList.add('disabled');
            } else {
                // Registrar evento de click para días habilitados
                cell.addEventListener('click', () => {
                    selectCalendarDate(cellDate, cell);
                });

                // Mantener selección si ya estaba seleccionado este día
                if (AppState.selectedDate && AppState.selectedDate.getTime() === cellDate.getTime()) {
                    cell.classList.add('selected');
                }
            }

            DOM.calendarDaysGrid.appendChild(cell);
        }
    }

    // Cambiar de mes
    DOM.prevMonthBtn.addEventListener('click', () => {
        const today = new Date();
        const currentActiveMonth = new Date(AppState.currentCalendarYear, AppState.currentCalendarMonth, 1);
        
        // No permitir ir a meses anteriores al mes actual
        if (currentActiveMonth.getFullYear() <= today.getFullYear() && currentActiveMonth.getMonth() <= today.getMonth()) {
            return;
        }

        AppState.currentCalendarMonth--;
        if (AppState.currentCalendarMonth < 0) {
            AppState.currentCalendarMonth = 11;
            AppState.currentCalendarYear--;
        }
        renderCalendar();
        playTransitionClick();
    });

    DOM.nextMonthBtn.addEventListener('click', () => {
        AppState.currentCalendarMonth++;
        if (AppState.currentCalendarMonth > 11) {
            AppState.currentCalendarMonth = 0;
            AppState.currentCalendarYear++;
        }
        renderCalendar();
        playTransitionClick();
    });

    // Acción al seleccionar un día
    function selectCalendarDate(dateObj, cellElement) {
        // Remover seleccionado anterior
        const previousSelected = DOM.calendarDaysGrid.querySelector('.calendar-day-cell.selected');
        if (previousSelected) {
            previousSelected.classList.remove('selected');
        }

        // Marcar este día como seleccionado
        cellElement.classList.add('selected');
        AppState.selectedDate = dateObj;

        // Limpiar hora seleccionada previamente si cambia de día
        AppState.selectedTime = null;
        DOM.timeSlots.forEach(slot => slot.classList.remove('selected'));

        // Mostrar el selector de horas
        DOM.timeSlotsGrid.style.display = 'grid';
        DOM.timeWarningMsg.style.display = 'none';

        // Evaluar qué horas ya están reservadas en esta fecha específica
        checkBookedSlotsForDate(dateObj);

        updateFormSummary();
        playTransitionClick();
    }

    // Deshabilitar slots de horas que ya estén reservados para ese día
    function checkBookedSlotsForDate(dateObj) {
        const dateStr = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`;
        
        DOM.timeSlots.forEach(slot => {
            const slotTimeStr = slot.getAttribute('data-time'); // e.g. "12:00"
            const [slotHour, slotMin] = slotTimeStr.split(':').map(Number);
            const slotStart = slotHour + (slotMin / 60);
            const slotEnd = slotStart + AppState.selectedPackageDuration;

            // 1. Buscar overlaps en reservas locales (AppState.bookings)
            const overlapsLocal = AppState.bookings.some(booking => {
                if (booking.dateString !== dateStr) return false;
                
                const existRange = parseTimeRangeTo24h(booking.time);
                if (!existRange) {
                    const parts = booking.time.split(':').map(Number);
                    if (parts.length >= 2) {
                        const exStart = parts[0] + (parts[1] / 60);
                        return slotStart < (exStart + 1) && exStart < slotEnd;
                    }
                    return false;
                }
                
                return slotStart < existRange.end && existRange.start < slotEnd;
            });

            // 2. Buscar overlaps en reservas de Google Sheets (AppState.spreadsheetBookings)
            const overlapsSpreadsheet = (AppState.spreadsheetBookings || []).some(booking => {
                if (booking.dateString !== dateStr) return false;
                
                const existRange = booking.range24h;
                if (!existRange) return false;
                
                return slotStart < existRange.end && existRange.start < slotEnd;
            });

            if (overlapsLocal || overlapsSpreadsheet) {
                slot.classList.add('disabled');
                slot.disabled = true;
                if (slot.classList.contains('selected')) {
                    slot.classList.remove('selected');
                    AppState.selectedTime = null;
                    const badgeBox = document.getElementById('duration-badge-box');
                    if (badgeBox) badgeBox.style.display = 'none';
                    updateFormSummary();
                }
            } else {
                slot.classList.remove('disabled');
                slot.disabled = false;
            }
        });
    }

    // Helper robusto para separar celdas de una línea CSV respetando comillas
    function parseCSVLine(text) {
        const result = [];
        let curVal = '';
        let inQuotes = false;
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(curVal);
                curVal = '';
            } else {
                curVal += char;
            }
        }
        result.push(curVal);
        return result;
    }

    // Helper para parsear rango horario ("12:00 PM - 05:00 PM" o "12:00 PM a 05:00 PM") a decimales 24h
    function parseTimeRangeTo24h(rangeStr) {
        if (!rangeStr) return null;
        const parts = rangeStr.split(/[-a]/).map(s => s.trim());
        if (parts.length < 2) return null;
        
        const parseHour = (timeStr) => {
            const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
            if (!match) return null;
            let hour = parseInt(match[1]);
            const min = parseInt(match[2]);
            const ampm = match[3].toUpperCase();
            
            if (ampm === 'PM' && hour < 12) hour += 12;
            if (ampm === 'AM' && hour === 12) hour = 0;
            return hour + (min / 60);
        };
        
        const startVal = parseHour(parts[0]);
        const endVal = parseHour(parts[1]);
        
        if (startVal === null || endVal === null) return null;
        return { start: startVal, end: endVal };
    }

    // Selección de hora
    DOM.timeSlots.forEach(slot => {
        slot.addEventListener('click', () => {
            if (slot.classList.contains('disabled')) return;

            // Deseleccionar anteriores
            DOM.timeSlots.forEach(s => s.classList.remove('selected'));
            
            // Seleccionar actual
            slot.classList.add('selected');
            
            // Calcular automáticamente hora de finalización según la duración
            const clickedTime = slot.getAttribute('data-time');
            recalculateRangeFromStartTime(clickedTime);

            playTransitionClick();
        });
    });

    // Función de cálculo automático de rango horario y duración
    function recalculateRangeFromStartTime(startTime) {
        AppState.rawStartTime = startTime;
        
        // Calcular hora final sumando la duración en horas del servicio activo
        const [startHour, startMin] = startTime.split(':').map(Number);
        let endHour = startHour + AppState.selectedPackageDuration;
        
        // Formatear hora de inicio a formato de 12 horas
        const startAmpm = startHour >= 12 ? 'PM' : 'AM';
        const startHour12 = startHour % 12 || 12;
        const formattedStart = `${startHour12 < 10 ? '0' + startHour12 : startHour12}:00 ${startAmpm}`;
        
        // Formatear hora de finalización a formato de 12 horas
        const endAmpm = endHour >= 12 ? 'PM' : 'AM';
        const endHour12 = endHour % 12 || 12;
        const formattedEnd = `${endHour12 < 10 ? '0' + endHour12 : endHour12}:00 ${endAmpm}`;

        const rangeValue = `${formattedStart} - ${formattedEnd}`;
        const rangeText = `${formattedStart} a ${formattedEnd}`;

        // Guardar el rango de tiempo en el estado de la reserva
        AppState.selectedTime = rangeValue;

        // Actualizar visualmente el badge dinámico del DOM
        const badgeBox = document.getElementById('duration-badge-box');
        const badgeText = document.getElementById('calculated-time-range');
        const badgeHours = document.getElementById('calculated-duration-hours');
        
        if (badgeBox && badgeText && badgeHours) {
            badgeText.textContent = rangeText;
            badgeHours.textContent = `(${AppState.selectedPackageDuration} horas)`;
            badgeBox.style.display = 'flex';
        }

        updateFormSummary();
        checkOverlapForSelectedTime();
    }

    // Comprobar solapamiento de la hora seleccionada con las reservas existentes
    function checkOverlapForSelectedTime() {
        if (!AppState.selectedDate || !AppState.rawStartTime) {
            AppState.hasOverlapWarning = false;
            const warningBox = document.getElementById('overlap-warning-box');
            if (warningBox) warningBox.style.display = 'none';
            return;
        }

        const dateStr = `${AppState.selectedDate.getFullYear()}-${String(AppState.selectedDate.getMonth() + 1).padStart(2, '0')}-${String(AppState.selectedDate.getDate()).padStart(2, '0')}`;
        
        const [startHour, startMin] = AppState.rawStartTime.split(':').map(Number);
        const slotStart = startHour + (startMin / 60);
        const slotEnd = slotStart + AppState.selectedPackageDuration;

        // 1. Buscar overlaps en reservas locales
        const overlapsLocal = AppState.bookings.some(booking => {
            if (booking.dateString !== dateStr) return false;
            
            const existRange = parseTimeRangeTo24h(booking.time);
            if (!existRange) {
                const parts = booking.time.split(':').map(Number);
                if (parts.length >= 2) {
                    const exStart = parts[0] + (parts[1] / 60);
                    return slotStart < (exStart + 1) && exStart < slotEnd;
                }
                return false;
            }
            
            return slotStart < existRange.end && existRange.start < slotEnd;
        });

        // 2. Buscar overlaps en reservas de Google Sheets
        const overlapsSpreadsheet = (AppState.spreadsheetBookings || []).some(booking => {
            if (booking.dateString !== dateStr) return false;
            
            const existRange = booking.range24h;
            if (!existRange) return false;
            
            return slotStart < existRange.end && existRange.start < slotEnd;
        });

        const warningBox = document.getElementById('overlap-warning-box');
        const warningText = document.getElementById('overlap-warning-text');

        if (overlapsLocal || overlapsSpreadsheet) {
            AppState.hasOverlapWarning = true;
            if (warningBox && warningText) {
                warningText.textContent = `El horario de ${AppState.selectedTime.replace(' - ', ' a ')} se cruza con otra sesión ya programada en esta fecha.`;
                warningBox.style.display = 'flex';
                warningBox.classList.remove('shake-warning');
                void warningBox.offsetWidth; // trigger reflow
                warningBox.classList.add('shake-warning');
            }
        } else {
            AppState.hasOverlapWarning = false;
            if (warningBox) {
                warningBox.style.display = 'none';
            }
        }

        validateFormCompleteness();
    }

    // Inicializar Calendario
    renderCalendar();
    fetchSpreadsheetBookings();
    // Ocultar cuadrícula horaria inicialmente hasta elegir un día
    DOM.timeSlotsGrid.style.display = 'none';
    DOM.timeWarningMsg.style.display = 'block';



    // Eventos de búsqueda de ubicación
    DOM.locationSearchBtn.addEventListener('click', searchAddress);
    DOM.locationSearchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            searchAddress();
        }
    });


    /* ==========================================================================
       6. VALIDACIÓN Y ENVÍO DE RESERVAS (PERSISTENCIA Y EFECTOS)
       ========================================================================== */
    function validateFormCompleteness() {
        const hasPackage = !!AppState.selectedPackage;
        const hasDate = !!AppState.selectedDate;
        const hasTime = !!AppState.selectedTime;
        const hasName = DOM.clientNameInput.value.trim().length > 2;
        const hasEmail = DOM.clientEmailInput.checkValidity() && DOM.clientEmailInput.value.trim().length > 0;
        const hasPhone = DOM.clientPhoneInput.value.trim().length > 5;
        const hasLocation = !!AppState.selectedLocation.address;

        const isComplete = hasPackage && hasDate && hasTime && hasName && hasEmail && hasPhone && hasLocation && !AppState.hasOverlapWarning;
        DOM.confirmBtn.disabled = !isComplete;
    }

    // Escuchar inputs del formulario para habilitar el botón dinámicamente
    [DOM.clientNameInput, DOM.clientEmailInput, DOM.clientPhoneInput, DOM.locationSearchInput].forEach(input => {
        input.addEventListener('input', validateFormCompleteness);
    });

    // Escuchar cuando el usuario borra completamente la dirección de búsqueda
    DOM.locationSearchInput.addEventListener('input', () => {
        if (DOM.locationSearchInput.value.trim().length === 0) {
            showLocationError('Por favor, busca una dirección o selecciona un punto en el mapa.');
        }
    });

    // Envío del Formulario de Reserva
    DOM.bookingForm.addEventListener('submit', (e) => {
        e.preventDefault();

        if (DOM.confirmBtn.disabled) return;

        // 1. Recopilar datos del cliente
        const name = DOM.clientNameInput.value.trim();
        const email = DOM.clientEmailInput.value.trim();
        const phone = DOM.clientPhoneInput.value.trim();
        const notes = DOM.clientNotesInput.value.trim();
        
        const bookingId = `RXC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
        const dateStr = `${AppState.selectedDate.getFullYear()}-${String(AppState.selectedDate.getMonth() + 1).padStart(2, '0')}-${String(AppState.selectedDate.getDate()).padStart(2, '0')}`;

        // Función auxiliar para dar formato ISO 8601 con offset local exacto (e.g. 2026-05-31T22:22:27.193-05:00)
        const formatOffsetISO = (date) => {
            const pad = (num, size = 2) => {
                let s = num.toString();
                while (s.length < size) s = "0" + s;
                return s;
            };
            const year = date.getFullYear();
            const month = pad(date.getMonth() + 1);
            const day = pad(date.getDate());
            const hours = pad(date.getHours());
            const minutes = pad(date.getMinutes());
            const seconds = pad(date.getSeconds());
            const ms = pad(date.getMilliseconds(), 3);
            
            const offsetMin = date.getTimezoneOffset();
            const offsetSign = offsetMin <= 0 ? '+' : '-';
            const absOffsetMin = Math.abs(offsetMin);
            const offsetHours = pad(Math.floor(absOffsetMin / 60));
            const offsetMins = pad(absOffsetMin % 60);
            
            return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${ms}${offsetSign}${offsetHours}:${offsetMins}`;
        };

        // Calcular hora inicio y hora fin de la cita
        const [startHour, startMin] = AppState.rawStartTime.split(':').map(Number);
        
        const startDate = new Date(AppState.selectedDate);
        startDate.setHours(startHour, startMin || 0, 0, 0);

        const endDate = new Date(startDate);
        endDate.setHours(startDate.getHours() + AppState.selectedPackageDuration);

        const fechaInicioFormatted = formatOffsetISO(startDate);
        const fechaFinFormatted = formatOffsetISO(endDate);
        const fechaCreacionFormatted = formatOffsetISO(new Date());

        const newBooking = {
            id: bookingId,
            clientName: name,
            clientEmail: email,
            clientPhone: phone,
            notes: notes,
            packageName: AppState.selectedPackageName,
            packagePrice: AppState.selectedPackagePrice,
            dateString: dateStr, // yyyy-mm-dd
            time: AppState.selectedTime,
            location: AppState.selectedLocation.address,
            locationCoords: `${AppState.selectedLocation.lat.toFixed(6)},${AppState.selectedLocation.lng.toFixed(6)}`,
            googleMapsUrl: AppState.selectedLocation.googleMapsUrl
        };

        // 2. Guardar en el Estado Global y en LocalStorage
        AppState.bookings.push(newBooking);
        localStorage.setItem('reflexcam_bookings', JSON.stringify(AppState.bookings));

        // Enviar datos discretamente al webhook de n8n con un payload ultra-completo y bilingüe
        const webhookPayload = {
            id: bookingId,
            bookingId: bookingId,
            
            // Información del Cliente
            clientName: name,
            clientEmail: email,
            clientPhone: phone,
            clientNotes: notes,
            notes: notes,
            nombre_cliente: name,
            email_cliente: email,
            telefono_cliente: phone,
            notas: notes,

            // Información del Servicio
            packageName: AppState.selectedPackageName,
            packagePrice: AppState.selectedPackagePrice,
            packagePriceFormatted: `$${AppState.selectedPackagePrice.toLocaleString('es-CO')} COP`,
            durationHours: AppState.selectedPackageDuration,
            nombre_servicio: AppState.selectedPackageName,
            precio_cop: AppState.selectedPackagePrice,
            precio_formateado: `$${AppState.selectedPackagePrice.toLocaleString('es-CO')} COP`,
            duracion_horas: AppState.selectedPackageDuration,

            // Fecha y Horario
            dateString: dateStr,
            dateHumanized: formatDateString(AppState.selectedDate),
            timeRange: AppState.selectedTime,
            startTimeRaw: AppState.rawStartTime,
            fecha_iso: dateStr,
            fecha_humanizada: formatDateString(AppState.selectedDate),
            rango_horario: AppState.selectedTime,
            hora_inicio_militar: AppState.rawStartTime,
            fecha_inicio: fechaInicioFormatted,
            fecha_fin: fechaFinFormatted,
            fecha_creacion: fechaCreacionFormatted,

            // Ubicación de la Sesión
            sessionAddress: AppState.selectedLocation.address,
            direccion_sesion: AppState.selectedLocation.address,
            sessionCoords: `${AppState.selectedLocation.lat.toFixed(6)},${AppState.selectedLocation.lng.toFixed(6)}`,
            coordenadas: `${AppState.selectedLocation.lat.toFixed(6)},${AppState.selectedLocation.lng.toFixed(6)}`,
            googleMapsUrl: AppState.selectedLocation.googleMapsUrl,
            url_maps: AppState.selectedLocation.googleMapsUrl
        };

        const queryParams = new URLSearchParams();
        for (const [key, value] of Object.entries(webhookPayload)) {
            queryParams.append(key, String(value));
        }
        const webhookUrl = `https://kevincj2415.app.n8n.cloud/webhook/8a2a78b8-5d28-40d7-88e3-b6e98d7593a1?${queryParams.toString()}`;

        fetch(webhookUrl, {
            method: 'GET',
            mode: 'cors'
        })
        .then(response => {
            console.log('Webhook de n8n notificado con éxito:', response.status);
        })
        .catch(err => {
            console.warn('Fallo silencioso al notificar al webhook:', err);
        });

        // 3. DISPARAR EFECTOS VISUALES Y AUDITIVOS DE CÁMARA (FLASH + OBTURADOR)
        triggerCameraFlashEffect();
        playCameraShutterSound();

        // 4. Mostrar el Ticket de Confirmación Modal
        showConfirmationTicket(newBooking);

        // 5. Limpiar Formulario e Inicializar estados
        resetBookingForm();
        renderCalendar();
        
        // Re-cargar reservas externas tras un retraso de 3 segundos para que n8n registre los datos en Google Sheets
        setTimeout(fetchSpreadsheetBookings, 3000);
    });

    // Simular destello de flash de cámara iluminando la pantalla entera
    function triggerCameraFlashEffect() {
        DOM.flashOverlay.classList.add('flash-active');
        
        // Mantener luz blanca instantánea y desvanecer
        setTimeout(() => {
            DOM.flashOverlay.style.transition = 'opacity 0.6s ease-out';
            DOM.flashOverlay.classList.remove('flash-active');
            
            // Limpiar estilos inline de transición tras terminar
            setTimeout(() => {
                DOM.flashOverlay.style.transition = 'opacity 0.05s ease-out';
            }, 600);
        }, 80);
    }

    // Llenar datos y lanzar modal
    function showConfirmationTicket(bookingObj) {
        DOM.ticketClientName.textContent = bookingObj.clientName;
        DOM.ticketService.textContent = bookingObj.packageName;
        DOM.ticketDate.textContent = formatDateString(new Date(bookingObj.dateString + 'T00:00:00'));
        DOM.ticketTime.textContent = formatTime12h(bookingObj.time);
        DOM.ticketPrice.textContent = `$${bookingObj.packagePrice.toLocaleString('es-CO')} COP`;
        DOM.ticketBookingId.textContent = `ID: ${bookingObj.id}`;
        DOM.ticketLocation.textContent = bookingObj.location || 'Por definir';

        DOM.modal.classList.add('active');
    }

    // Cerrar el modal
    DOM.closeModalBtn.addEventListener('click', () => {
        DOM.modal.classList.remove('active');
        playTransitionClick();
    });

    // Resetear formulario a valores iniciales
    function resetBookingForm() {
        DOM.bookingForm.reset();
        AppState.selectedDate = null;
        AppState.selectedTime = null;
        AppState.rawStartTime = null;
        AppState.hasOverlapWarning = false;
        
        // Resetear Ubicación en el Estado Global
        AppState.selectedLocation = {
            address: '',
            lat: null,
            lng: null,
            googleMapsUrl: ''
        };

        // Resetear visualización del mapa y buscador
        DOM.locationSearchInput.value = '';
        DOM.locResolvedInfo.classList.remove('success', 'error');
        DOM.locAddressText.textContent = 'Por favor, busca una dirección o selecciona un punto en el mapa.';

        // Reposicionar marcador Leaflet si está inicializado
        if (locationMarker && locationMap) {
            const defaultLat = 4.8133;
            const defaultLng = -75.6961;
            locationMarker.setLatLng([defaultLat, defaultLng]);
            locationMap.setView([defaultLat, defaultLng], 13);
        }
        
        // Ocultar visualmente el badge de duración estimada y la advertencia
        const badgeBox = document.getElementById('duration-badge-box');
        if (badgeBox) {
            badgeBox.style.display = 'none';
        }
        const warningBox = document.getElementById('overlap-warning-box');
        if (warningBox) {
            warningBox.style.display = 'none';
        }
        
        // Volver a configurar el resumen
        updateFormSummary();

        // Resetear visualmente las horas
        DOM.timeSlotsGrid.style.display = 'none';
        DOM.timeWarningMsg.style.display = 'block';
        DOM.timeSlots.forEach(s => s.classList.remove('selected'));

        }





    /* ==========================================================================
       7. INTEGRACIÓN DE MAPA Y GEOLOCALIZACIÓN (LEAFLET & NOMINATIM)
       ========================================================================== */
    let locationMap = null;
    let locationMarker = null;

    // Inicializar mapa de Leaflet
    function initLocationMap() {
        const defaultLat = 4.8133;
        const defaultLng = -75.6961;

        // Crear mapa en el contenedor #location-map
        locationMap = L.map('location-map', {
            center: [defaultLat, defaultLng],
            zoom: 13,
            zoomControl: true
        });
        // Cargar azulejos oficiales de OpenStreetMap (estilizados a modo oscuro vía CSS Filter)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }).addTo(locationMap);

        // Icono de Pin Dorado de Lujo personalizado
        const goldIcon = L.divIcon({
            className: 'luxury-map-pin',
            html: `<div style="
                width: 14px;
                height: 14px;
                background-color: #d4af37;
                border: 2px solid #ffffff;
                border-radius: 50%;
                box-shadow: 0 0 10px #d4af37, 0 0 20px #d4af37;
                position: relative;
            ">
                <div style="
                    content: '';
                    position: absolute;
                    width: 30px;
                    height: 30px;
                    border: 1px solid rgba(212, 175, 55, 0.4);
                    border-radius: 50%;
                    top: -10px;
                    left: -10px;
                    animation: pulsePin 2s infinite ease-out;
                "></div>
            </div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7]
        });

        // Crear marcador inicial inactivo (se activará al buscar o hacer click)
        locationMarker = L.marker([defaultLat, defaultLng], {
            icon: goldIcon,
            draggable: true
        }).addTo(locationMap);

        // Escuchar cuando el usuario arrastra el marcador
        locationMarker.on('dragend', function (e) {
            const position = locationMarker.getLatLng();
            resolveAddressFromCoords(position.lat, position.lng);
        });

        // Escuchar clicks en el mapa para mover el marcador
        locationMap.on('click', function (e) {
            const lat = e.latlng.lat;
            const lng = e.latlng.lng;
            setMarkerLocation(lat, lng);
            resolveAddressFromCoords(lat, lng);
        });
    }

    // Cambiar la posición del marcador en el mapa
    function setMarkerLocation(lat, lng) {
        if (!locationMarker) return;
        locationMarker.setLatLng([lat, lng]);
        locationMap.setView([lat, lng], 15);
        
        // Guardar coordenadas
        DOM.latitudeInput.value = lat.toFixed(6);
        DOM.longitudeInput.value = lng.toFixed(6);
        AppState.selectedLocation.lat = lat;
        AppState.selectedLocation.lng = lng;
        AppState.selectedLocation.googleMapsUrl = `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
    }

    // Buscar dirección usando la API de Nominatim
    function searchAddress() {
        const query = DOM.locationSearchInput.value.trim();
        if (!query) return;

        // Mostrar estado de carga visual
        DOM.locationSearchBtn.disabled = true;
        DOM.locationSearchBtn.querySelector('span').textContent = 'Buscando...';

        // URL para la API pública de Nominatim OpenStreetMap
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=1`;

        fetch(url, {
            headers: {
                'Accept-Language': 'es' // Pedir resultados en español
            }
        })
        .then(res => res.json())
        .then(data => {
            if (data && data.length > 0) {
                const result = data[0];
                const lat = parseFloat(result.lat);
                const lng = parseFloat(result.lon);
                const addressName = result.display_name;

                // Centrar mapa e ir a la dirección encontrada
                setMarkerLocation(lat, lng);

                // Confirmar y guardar la dirección
                confirmLocation(addressName, lat, lng);
            } else {
                showLocationError('No se encontraron resultados para la dirección especificada.');
            }
        })
        .catch(err => {
            console.error('Error de geocodificación:', err);
            showLocationError('Error al conectar con el de búsqueda. Inténtalo de nuevo.');
        })
        .finally(() => {
            DOM.locationSearchBtn.disabled = false;
            DOM.locationSearchBtn.querySelector('span').textContent = 'Buscar';
        });
    }

    // Geocodificación inversa (Coords -> Dirección de texto) usando Nominatim
    function resolveAddressFromCoords(lat, lng) {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`;

        fetch(url, {
            headers: {
                'Accept-Language': 'es'
            }
        })
        .then(res => res.json())
        .then(data => {
            if (data && data.display_name) {
                confirmLocation(data.display_name, lat, lng);
            } else {
                confirmLocation(`Coordenadas: ${lat.toFixed(5)}, ${lng.toFixed(5)}`, lat, lng);
            }
        })
        .catch(err => {
            console.error('Error de geocodificación inversa:', err);
            confirmLocation(`Ubicación seleccionada (${lat.toFixed(5)}, ${lng.toFixed(5)})`, lat, lng);
        });
    }

    // Confirmar y almacenar la ubicación
    function confirmLocation(addressName, lat, lng) {
        AppState.selectedLocation.address = addressName;
        AppState.selectedLocation.lat = lat;
        AppState.selectedLocation.lng = lng;
        AppState.selectedLocation.googleMapsUrl = `https://www.google.com/maps?q=${lat.toFixed(6)},${lng.toFixed(6)}`;

        // Actualizar visualmente el buscador de texto
        DOM.locationSearchInput.value = addressName;

        // Actualizar visualmente el badge de confirmación
        DOM.locResolvedInfo.classList.remove('error');
        DOM.locResolvedInfo.classList.add('success');
        DOM.locAddressText.textContent = addressName;

        // Validar integridad del formulario completo
        validateFormCompleteness();
    }

    // Mostrar mensaje de error en la ubicación
    function showLocationError(msg) {
        DOM.locResolvedInfo.classList.remove('success');
        DOM.locResolvedInfo.classList.add('error');
        DOM.locAddressText.textContent = msg;
        
        // Limpiar ubicación del estado
        AppState.selectedLocation.address = '';
        AppState.selectedLocation.lat = null;
        AppState.selectedLocation.lng = null;
        AppState.selectedLocation.googleMapsUrl = '';

        validateFormCompleteness();
    }

    // Cargar reservas externas desde Google Sheets (publicado como CSV)
    function fetchSpreadsheetBookings() {
        const csvUrl = 'https://docs.google.com/spreadsheets/d/1BkDxDb7lkFm8Xp1ZPxS8vF0lsK1Oc4XoU-tymaGFT0A/export?format=csv';

        fetch(csvUrl)
        .then(res => res.text())
        .then(csvText => {
            const lines = csvText.split('\n').map(line => line.trim()).filter(line => line.length > 0);
            if (lines.length < 2) return;
            
            const parsedBookings = [];
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i];
                const columns = parseCSVLine(line);
                if (columns.length < 2) continue;
                
                const fecha = columns[0].trim(); // yyyy-mm-dd
                const horario = columns[1].trim(); // hh:mm AM - hh:mm PM
                
                if (fecha && horario) {
                    parsedBookings.push({
                        dateString: fecha,
                        timeRange: horario,
                        range24h: parseTimeRangeTo24h(horario)
                    });
                }
            }
            
            AppState.spreadsheetBookings = parsedBookings;
            console.log('Reservas externas de Google Sheets cargadas:', AppState.spreadsheetBookings.length);
            
            // Si el usuario ya seleccionó un día, re-evaluar la disponibilidad horaria
            if (AppState.selectedDate) {
                checkBookedSlotsForDate(AppState.selectedDate);
            }
        })
        .catch(err => {
            console.warn('Error al cargar la hoja de cálculo de Google Sheets:', err);
        });
    }

    /* ==========================================================================
       8. UTILERÍAS DE FORMATEO
       ========================================================================== */
    // Formatea fecha a: "Lunes, 15 de Junio de 2026"
    function formatDateString(dateObj) {
        const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const dayName = days[dateObj.getDay()];
        const dayNum = dateObj.getDate();
        const monthName = MONTH_NAMES[dateObj.getMonth()];
        const year = dateObj.getFullYear();

        return `${dayName}, ${dayNum} de ${monthName} de ${year}`;
    }

    // Formatea hora militar a 12 horas: "17:00" -> "05:00 PM"
    function formatTime12h(timeStr) {
        if (timeStr.includes(' - ') || timeStr.includes('AM') || timeStr.includes('PM')) {
            return timeStr;
        }
        const [hour, min] = timeStr.split(':').map(Number);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        const hour12 = hour % 12 || 12;
        const formattedHour = hour12 < 10 ? `0${hour12}` : hour12;
        
        return `${formattedHour}:${min < 10 ? '0' + min : min} ${ampm}`;
    }

});
