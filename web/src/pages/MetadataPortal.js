// src/pages/MetadataPortal.js
import React, { useEffect, useRef, useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { logInteraction } from "../utils/logInteraction";
import "./MetadataPortal.css"; // optional: create for custom styles

function InfoModal({ open, onClose, title = "About the Metadata Portal", children }) {
    const dialogRef = useRef(null);

    useEffect(() => {
        if (open) {
            dialogRef.current?.focus();
            document.body.classList.add("mp-modal-open");
            return () => document.body.classList.remove("mp-modal-open");
        }
    }, [open]);

    if (!open) return null;

    return (
        <div className="mp-overlay" role="presentation" onClick={onClose}>
            <div
                className="mp-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="mp-title"
                aria-describedby="mp-desc"
                onClick={(e) => e.stopPropagation()}
                tabIndex={-1}
                ref={dialogRef}
            >
                <div className="mp-header">
                    <h2 id="mp-title">{title}</h2>
                    <button className="mp-close" onClick={onClose} aria-label="Close">
                        ×
                    </button>
                </div>
                <div className="mp-body" id="mp-desc">{children}</div>
                <div className="mp-actions">
                    <button className="mp-btn" onClick={onClose}>Close</button>
                </div>
            </div>
        </div>
    );
}

const MetadataPortal = ({ user }) => {
    const navigate = useNavigate();
    const [hoveredCard, setHoveredCard] = useState(null);
    const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
    const [openInfo, setOpenInfo] = useState(false);

    const allowed = !!user && (user.role === "Admin" || user.role === "SU");

    // ✅ Hooks are always called (no early return before this)
    useEffect(() => {
        logInteraction("page_view", { page: "MetadataPortal" }, user);
    }, [user]);

    // Define your portal “apps”
    const cards = [
        {
            name: "Phentab STS",
            key: "phentab-sts",
            icon: "/images/placeholders/phentab.png", // placeholder
            route: "/metadata/phentab-sts",
            allowedRoles: ["Admin", "SU"],
            desc: "Terrestrial phenomena table – build, standardise, and manage phenomenon names."
        },
        {
            name: "Controlled Vocabularies",
            key: "cvs",
            icon: "/images/placeholders/vocab.png",
            route: "/metadata/controlled-vocabularies",
            allowedRoles: ["Admin", "SU"],
            desc: "Create and curate terms, aliases, synonyms, and bindings."
        },
        {
            name: "Nomenclature Manager",
            key: "nomenclature",
            icon: "/images/placeholders/nomenclature.png",
            route: "/metadata/nomenclature",
            allowedRoles: ["Admin", "SU"],
            desc: "Naming rules, patterns, validations, and linting."
        },
        {
            name: "Metadata Schemas",
            key: "schemas",
            icon: "/images/placeholders/schemas.png",
            route: "/metadata/schemas",
            allowedRoles: ["Admin", "SU"],
            desc: "Define schemas (fields, types, constraints) for datasets and APIs."
        },
        {
            name: "Mappings",
            key: "mappings",
            icon: "/images/placeholders/mappings.png",
            route: "/metadata/mappings",
            allowedRoles: ["Admin", "SU"],
            desc: "Map external terms/tables to SAEON standards."
        },
        {
            name: "Imports",
            key: "imports",
            icon: "/images/placeholders/imports.png",
            route: "/metadata/imports",
            allowedRoles: ["Admin", "SU"],
            desc: "Upload CSV/JSON/YAML to seed or update standards."
        },
        {
            name: "Exports",
            key: "exports",
            icon: "/images/placeholders/exports.png",
            route: "/metadata/exports",
            allowedRoles: ["Admin", "SU"],
            desc: "Download standards as CSV/JSON/YAML for reuse."
        },
        {
            name: "Audit Logs",
            key: "audit",
            icon: "/images/placeholders/audit.png",
            route: "/metadata/audit",
            allowedRoles: ["SU"], // restrict deeper auditing to SU only
            desc: "Trace changes, approvals, and provenance."
        },
        {
            name: "Settings",
            key: "settings",
            icon: "/images/placeholders/settings.png",
            route: "/metadata/settings",
            allowedRoles: ["SU"],
            desc: "Role access, workflow rules, and publication status."
        }
    ];

    const handleEnter = (e, card, hasAccess) => {
        if (!hasAccess) {
            setHoveredCard(card.key);
            const rect = e.currentTarget.getBoundingClientRect();
            setTooltipPos({ top: rect.top - 36, left: rect.left + rect.width / 2 });
        }
    };
    const handleLeave = () => setHoveredCard(null);

    const handleClick = (card) => {
        const hasAccess = card.allowedRoles.includes(user.role);
        logInteraction("portal_click", { card: card.key, hasAccess }, user);
        if (hasAccess) {
            navigate(card.route);
        }
    };

    // ✅ Branch only here; hooks above are always called
    return allowed ? (
        <div className="metadata-portal">
            <div className="mp-headerbar">
                <div className="mp-titlegroup">
                    <h1>Metadata Portal</h1>
                    <p>Interfaces for nomenclature standardisation, controlled vocabularies, schemas, and mappings.</p>
                </div>
                <button
                    className="mp-info"
                    onClick={() => setOpenInfo(true)}
                    aria-label="Open Metadata Portal information"
                >
                    ⓘ
                </button>
            </div>

            <section className="mp-grid">
                {cards.map((card) => {
                    const hasAccess = card.allowedRoles.includes(user.role);
                    return (
                        <div
                            key={card.key}
                            className={`mp-card ${hasAccess ? "" : "mp-card-disabled"}`}
                            role="button"
                            tabIndex={0}
                            aria-label={`Open ${card.name}`}
                            onClick={() => hasAccess && handleClick(card)}
                            onKeyDown={(e) => e.key === "Enter" && hasAccess && handleClick(card)}
                            onMouseEnter={(e) => handleEnter(e, card, hasAccess)}
                            onMouseLeave={handleLeave}
                        >
                            <img
                                src={card.icon}
                                alt={`${card.name} icon`}
                                className="mp-card-icon"
                                onError={(e) => { e.currentTarget.src = "/images/placeholders/placeholder.png"; }}
                            />
                            <h3 className="mp-card-title">{card.name}</h3>
                            <p className="mp-card-desc">{card.desc}</p>
                            {!hasAccess && <span className="mp-lock">🔒 Admin / SU only</span>}
                        </div>
                    );
                })}
                {hoveredCard && (
                    <div className="mp-tooltip" style={{ top: tooltipPos.top, left: tooltipPos.left }}>
                        Admin / SU required
                    </div>
                )}
            </section>

            <InfoModal open={openInfo} onClose={() => setOpenInfo(false)}>
                <p>
                    The Metadata Portal centralises standardisation work for SAEON:
                </p>
                <ul>
                    <li><strong>Phentab STS</strong> — manage terrestrial phenomena names and standards.</li>
                    <li><strong>Controlled Vocabularies</strong> — curate terms, aliases, and bindings.</li>
                    <li><strong>Metadata Schemas</strong> — define fields, types, and constraints.</li>
                    <li><strong>Mappings</strong> — align external systems to SAEON standards.</li>
                    <li><strong>Audit & Settings</strong> — provenance and governance (SU only).</li>
                </ul>
            </InfoModal>
        </div>
    ) : (
        <Navigate to="/home" replace />
    );
};

export default MetadataPortal;