import React from "react";
import { Nav, NavTitle, NavLink, NavMenu } from "./NavbarElements";

const Navbar = () => {
    return (
        <Nav>
            <NavTitle>Loggernet testing</NavTitle>
            <NavMenu>

                {/*<NavLink to="/DataTable" activeStyle>*/}
                {/*    Datatest Day*/}
                {/*</NavLink>*/}
                <NavLink to="/ScrollableTable" activeStyle>
                    Data
                </NavLink>
                <NavLink to="/index" activeStyle>
                    Loggernet site details
                </NavLink>
                {/*<NavLink to="/WorldWindMap" activeStyle>*/}
                {/*    Map Example*/}
                {/*</NavLink>*/}
                <NavLink to="/about" activeStyle>
                    About
                </NavLink>
            </NavMenu>
        </Nav>
    );
};

export default Navbar;
