def square_root_bisection(n, tol=0.01, limit=100):
    if n < 0:
        raise ValueError("Square root of negative is not defined in real numbers")
    
    if (n == 0) or (n == 1):
        print(f"The square root of {n} is {n}")
        return # Exit early for these cases

    # 1. Initialize bounds properly
    # For n > 1, root is between 1 and n. For n < 1, root is between n and 1.
    xl = 0.0
    xu = float(max(1, n))
    root = 0

    while(limit > 0):
        xm = (xl + xu) / 2
        
        # Using f(x) = x^2 - n is more stable for computers
        fxl = (xl**2) - n
        fxu = (xu**2) - n
        fxm = (xm**2) - n
        
        # Your specific print formatting
        print("xl:", xl)
        print("xm:", xm)
        print("xu:", xu)
        print("fxl, fxm, fxu:", fxl, fxm, fxu)

        # The Bisection Logic
        if fxl * fxm < 0:
            xu = xm
        elif fxl * fxm > 0:
            xl = xm
        
        # 2. The Tolerance Check
        # Instead of fxl*fxm == 0, we check if the window is small enough
        if abs(xu - xl) < tol:
            root = xm
            break # We found it!
            
        limit -= 1
    
    print(f"The square root of {n} is approximately {root}")

square_root_bisection(5)